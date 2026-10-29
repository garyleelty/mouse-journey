'use strict';
/**
 * 共享地理工具：主进程（require）与渲染进程（<script>）都可使用。
 * 采用 UMD 包装，方便无打包器环境下直接以普通 script 引入。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Geo = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const R = 6371.0088; // 地球平均半径（km）
  const toRad = (d) => (d * Math.PI) / 180;

  /** 两点大圆距离（km） */
  function haversineKm(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const la1 = toRad(a.lat);
    const la2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** 折线累计里程（km），返回 [0, k1, k1+k2, ...] */
  function cumulativeKm(points) {
    const out = [0];
    for (let i = 1; i < points.length; i++) {
      out.push(out[i - 1] + haversineKm(points[i - 1], points[i]));
    }
    return out;
  }

  /**
   * 等距圆柱投影（小尺寸示意足够）。把经纬度映射到画布像素。
   * lon 方向按基准纬度做余弦压缩，保证形状不失真得太离谱。
   */
  function createProjector(bbox, width, height, padding) {
    const pad = padding == null ? 8 : padding;
    const lon0 = (bbox.minLon + bbox.maxLon) / 2;
    const lat0 = (bbox.minLat + bbox.maxLat) / 2;
    const kx = Math.cos(toRad(lat0));
    const x0 = (bbox.minLon - lon0) * kx;
    const x1 = (bbox.maxLon - lon0) * kx;
    const y0 = bbox.minLat - lat0;
    const y1 = bbox.maxLat - lat0;
    const sx = (width - pad * 2) / (x1 - x0);
    const sy = (height - pad * 2) / (y1 - y0);
    const s = Math.min(sx, sy);
    const offX = pad + ((width - pad * 2) - (x1 - x0) * s) / 2;
    const offY = pad + ((height - pad * 2) - (y1 - y0) * s) / 2;
    return {
      scale: s,
      toXY(lon, lat) {
        return {
          x: offX + ((lon - lon0) * kx - x0) * s,
          // 纬度向北为正，画布 y 向下为正 → 取反
          y: offY + (y1 - (lat - lat0)) * s
        };
      }
    };
  }

  /** 把点投影到线段上，返回插值参数 t∈[0,1] */
  function projectOnSegment(p, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) return 0;
    let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
    return Math.max(0, Math.min(1, t));
  }

  /**
   * 求目标点到路线折线的最近点。
   * @param {Array<{lon:number,lat:number}>} points 路线顶点
   * @param {Array<number>} cum 累计里程（由 cumulativeKm 得到）
   * @param {{lon:number,lat:number}} target
   * @returns {{km:number, distKm:number, lon:number, lat:number}}
   */
  function nearestOnRoute(points, cum, target) {
    const kx = Math.cos(toRad(target.lat));
    const flat = (p) => ({ x: p.lon * kx, y: p.lat });
    const tp = flat(target);
    let best = { km: 0, distKm: Infinity, lon: points[0].lon, lat: points[0].lat };
    for (let i = 1; i < points.length; i++) {
      const a = flat(points[i - 1]);
      const b = flat(points[i]);
      const t = projectOnSegment(tp, a, b);
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t;
      const cand = { lon: cx / kx, lat: cy };
      const d = haversineKm(cand, target);
      if (d < best.distKm) {
        best = { km: cum[i - 1] + (cum[i] - cum[i - 1]) * t, distKm: d, lon: cand.lon, lat: cand.lat };
      }
    }
    return best;
  }

  /** 在折线上按里程取点 + 前进方向角（度，0=正北，顺时针） */
  function pointAtKm(points, cum, km) {
    const total = cum[cum.length - 1];
    const k = Math.max(0, Math.min(total, km));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < k) i++;
    const segLen = cum[i] - cum[i - 1] || 1;
    const t = (k - cum[i - 1]) / segLen;
    const a = points[i - 1];
    const b = points[i];
    const lon = a.lon + (b.lon - a.lon) * t;
    const lat = a.lat + (b.lat - a.lat) * t;
    const dLon = (b.lon - a.lon) * Math.cos(toRad(lat));
    const dLat = b.lat - a.lat;
    const heading = (Math.atan2(dLon, dLat) * 180) / Math.PI;
    return { lon, lat, heading, index: i, t };
  }

  return { haversineKm, cumulativeKm, createProjector, nearestOnRoute, pointAtKm, R };
});
