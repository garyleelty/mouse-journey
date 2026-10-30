'use strict';
/**
 * SceneryKit —— 第一人称「在路上」视角（纯 Canvas 2D 伪 3D）
 *
 * 与俯视地图不同：镜头贴在路面上往前看，纵深里的物体由远及近地放大，
 * 这就是「身临其境」的来源。三条纪律：
 *  1. 道路走向取自真实路线几何（Geo.pointAtKm），所以路会随着真实线路左右弯曲；
 *  2. 画面不会自己动：每一米都来自真实鼠标里程（1 真实米 = 1 路线公里 = 1000 场景米）；
 *  3. 不使用渐变——距离感靠分层实色（天空 / 远雾 / 地面 / 田野 / 路面）叠出来。
 */
(function () {
  const T = {
    sky: '#f5f6f8',
    haze: '#e9ecf2',
    hillFar: '#dee3eb',
    hill: '#d2d8e3',
    ground: '#e2e5ec',
    verge: '#eef0f5',
    furrow: '#d9dde6',
    road: '#fafbfd',
    roadEdge: '#d9dde5',
    line: '#1d5fbf',          // 唯一数据色：路面中心线 = 你正在走的行程
    pole: '#b4bbc7',
    canopy: '#ccd3de',
    board: '#ffffff',
    boardEdge: '#c9cfd9',
    city: '#c9d0db',
    ink: '#0a0a0a',
    font: '600 10px Geist, Inter, system-ui, -apple-system, "PingFang SC", sans-serif'
  };

  const FOCAL = 250;      // 焦距（px·m）
  const CAM_H = 1.55;     // 视高（m）
  const ROAD_HALF = 5.2;  // 路面半宽（m）
  const VERGE = 2.6;      // 路肩宽（m）
  const VIEW = 420;       // 可视纵深（m）
  const SAMPLES = 72;

  /* ---- 地貌分段配色：按当前经纬度确定性混色，纯离线 ----
   * 全国划 7 个地貌区（矩形近似），每区一套低饱和实色；
   * 距区界越近权重越低，跨区在 fade 公里内线性过渡，避免硬切。
   * 路面 / 中心线（唯一数据色）/ 指示牌不参与混色，保持 achromatic ledger 纪律。 */
  const PLAINS = {
    sky: T.sky, haze: T.haze, hillFar: T.hillFar, hill: T.hill,
    ground: T.ground, verge: T.verge, furrow: T.furrow,
    pole: T.pole, canopy: T.canopy, city: T.city
  };

  const BIOMES = [
    // 青藏高原：地平线泛雪白，草甸灰绿（东界 102.5°E：横断山起爬升，成都平原保持农田色）
    { id: 'plateau', fade: 220, rects: [[78, 26, 102.5, 38]],
      P: { sky: '#f3f5f9', haze: '#e3e9f3', hillFar: '#eff2f8', hill: '#d3dce9', ground: '#e1e6e2', verge: '#edf0f0', furrow: '#d5dcd9', canopy: '#bfcdc6', pole: '#b0b9c6', city: '#c4ccd8' } },
    // 西北戈壁
    { id: 'gobi', fade: 180, rects: [[86, 35.5, 108, 45]],
      P: { sky: '#f8f6f0', haze: '#efe9dc', hillFar: '#ebe4d3', hill: '#ddd3bd', ground: '#eae2d0', verge: '#f1ecdf', furrow: '#ddd3bc', canopy: '#d1c6aa', pole: '#b6b09f', city: '#d0c9b7' } },
    // 内蒙草原
    { id: 'steppe', fade: 160, rects: [[106, 39.5, 115, 47.5]],
      P: { sky: '#f4f8f2', haze: '#e7efe3', hillFar: '#dbe6d6', hill: '#ccdac2', ground: '#dfe7d2', verge: '#eaf1e1', furrow: '#cfddc0', canopy: '#b0c8a6', pole: '#afb8a6', city: '#c5cebc' } },
    // 黄土高原
    { id: 'loess', fade: 140, rects: [[103.5, 34.5, 112, 40.5]],
      P: { sky: '#f8f6f1', haze: '#f0e9da', hillFar: '#ece2cb', hill: '#ddd0b2', ground: '#e9e0ca', verge: '#f0e9d8', furrow: '#dbd1b4', canopy: '#cec29d', pole: '#b4ab95', city: '#d1c8b0' } },
    // 云贵红土
    { id: 'redsoil', fade: 140, rects: [[99, 23, 110, 29.5]],
      P: { sky: '#f7f6f3', haze: '#efe9e1', hillFar: '#e9e0d4', hill: '#d9cebe', ground: '#e8dccd', verge: '#f1ebe1', furrow: '#d8cab6', canopy: '#b2c7ac', pole: '#b5ac9f', city: '#cdc4b5' } },
    // 华南常绿（海南 + 东南沿海丘陵）
    { id: 'south', fade: 150, rects: [[108, 17, 112.5, 21.5], [109, 21.5, 122, 28.5]],
      P: { sky: '#f5f8f3', haze: '#e8f0e7', hillFar: '#d9e6d9', hill: '#c7dbca', ground: '#dce7d9', verge: '#e9f2e7', furrow: '#cadecb', canopy: '#9dc0a3', pole: '#acb7aa', city: '#c1cfc2' } },
    // 东北黑土
    { id: 'northeast', fade: 160, rects: [[122, 40, 135, 54]],
      P: { sky: '#f4f6f8', haze: '#e6ebef', hillFar: '#dde3e8', hill: '#cfd7dc', ground: '#e2dfd5', verge: '#eef0ec', furrow: '#d2cfc3', canopy: '#bbc8b9', pole: '#c1c2b9', city: '#c7cdd0' } }
  ];

  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const PLAINS_RGB = Object.fromEntries(Object.entries(PLAINS).map(([k, v]) => [k, hexRgb(v)]));
  const BIOME_RGB = BIOMES.map((b) => Object.fromEntries(Object.entries(b.P).map(([k, v]) => [k, hexRgb(v)])));

  /** 矩形地貌区之外的距离（km），区内为 0 */
  function rectDistKm(lon, lat, r) {
    const dLon = Math.max(r[0] - lon, lon - r[2], 0);
    const dLat = Math.max(r[1] - lat, lat - r[3], 0);
    if (!dLon && !dLat) return 0;
    return Math.hypot(dLon * 111.32 * Math.cos((lat * Math.PI) / 180), dLat * 111.32);
  }

  /** 当前位置的地貌配色（每个调色键 → hex），跨区在 fade 公里内线性过渡 */
  function terrainPalette(lon, lat) {
    const ws = BIOMES.map((b) => {
      let w = 0;
      for (const r of b.rects) w = Math.max(w, 1 - Math.min(1, rectDistKm(lon, lat, r) / b.fade));
      return w;
    });
    let total = ws.reduce((a, b) => a + b, 0);
    if (total <= 0) return PLAINS;
    if (total > 1) { for (let i = 0; i < ws.length; i++) ws[i] /= total; total = 1; }
    const plainsW = 1 - total;
    const out = {};
    for (const k in PLAINS) {
      const base = PLAINS_RGB[k];
      let r = base[0] * plainsW, gr = base[1] * plainsW, bl = base[2] * plainsW;
      for (let i = 0; i < BIOMES.length; i++) {
        if (!ws[i]) continue;
        const c = BIOME_RGB[i][k];
        r += c[0] * ws[i]; gr += c[1] * ws[i]; bl += c[2] * ws[i];
      }
      out[k] = `#${[r, gr, bl].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
    }
    return out;
  }

  /** 确定性伪随机：同一地点每次生成同样的路边景物 */
  function hash01(n) {
    let x = (Math.abs(Math.floor(n)) * 2654435761) % 4294967296;
    x ^= x >>> 15; x = (x * 2246822519) % 4294967296;
    x ^= x >>> 13; x = (x * 3266489917) % 4294967296;
    return ((x % 100000) + 100000) % 100000 / 100000;
  }

  /** 剖面QLine：把 hint => 线性插值 */
  function interp(prof, key, z) {
    if (z <= prof[0].z) return prof[0][key];
    for (let i = 1; i < prof.length; i++) {
      if (z <= prof[i].z) {
        const a = prof[i - 1];
        const b = prof[i];
        const t = (z - a.z) / (b.z - a.z || 1);
        return a[key] + (b[key] - a[key]) * t;
      }
    }
    return prof[prof.length - 1][key];
  }

  function drawCity(g, o, w, hy) {
    const city = o.nextCity;
    if (!city) return;
    const remain = city.kmAhead;
    if (!(remain > 0) || remain > 24) return;
    const near = 1 - remain / 24;                 // 越近越大
    const baseH = (6 + near * 26) * (o.compact ? 0.6 : 1);
    const seed = Math.floor((city.lon || 0) * 10 + (city.lat || 0) * 10);
    const n = 9;
    const width = w * (0.16 + near * 0.22);
    const cx0 = w / 2 + (width * (0.1 + hash01(seed) * 0.2));
    g.fillStyle = o.pal.city;
    for (let i = 0; i < n; i++) {
      const r = hash01(seed + i * 13);
      const bw = width * (0.06 + r * 0.12);
      const bh = baseH * (0.35 + r * 1.0);
      const x = cx0 - width / 2 + (i / n) * width + hash01(seed + i) * 6;
      g.fillRect(x, hy - bh, bw, bh);
    }
    // 城市后面的远山（更淡，叠在城市之下先画）
  }

  function drawHills(g, w, hy, seed, pal) {
    const layers = [
      { color: pal.hillFar, amp: 16, base: 10 },
      { color: pal.hill, amp: 10, base: 5 }
    ];
    layers.forEach((L, li) => {
      g.fillStyle = L.color;
      g.beginPath();
      g.moveTo(0, hy);
      const step = Math.max(12, w / 26);
      for (let x = 0; x <= w + step; x += step) {
        const n = seed + li * 100 + Math.floor(x / step);
        const hgt = L.base + hash01(n) * L.amp + Math.sin((x / step) * 0.9 + li) * L.amp * 0.4;
        g.lineTo(x, hy - hgt);
      }
      g.lineTo(w, hy);
      g.closePath();
      g.fill();
    });
  }

  function render(canvas, o) {
    if (!canvas) return;
    // display:none 时 clientWidth 为 0：直接跳过，避免位图按 dpr 指数膨胀（同 map.js）
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // 相机侧倾（压弯 / 冲刺表现）：绕画面底部中心轻转，模拟重心移动
    const roll = Math.max(-0.06, Math.min(0.06, o.roll || 0));
    if (roll) {
      g.translate(w / 2, h);
      g.rotate(roll);
      g.translate(-w / 2, -h);
    }

    const compact = !!o.compact;
    const hy = Math.round(h * (compact ? 0.5 : 0.44));

    const route = o.route;
    if (!route || !route.points || route.points.length < 2) return;

    const total = route.totalKm || 1;
    const dm = Math.max(0, Math.min(total, o.progressKm || 0));   // 当前里程（km）
    const here = Geo.pointAtKm(route.points, route.cum, dm);

    // 地貌配色：由当前位置的经纬度确定性算出（跨区线性过渡）
    const P = terrainPalette(here.lon, here.lat);

    // 天地：分层实色（无渐变），随地貌渐变
    g.fillStyle = P.sky;
    g.fillRect(0, 0, w, hy);
    g.fillStyle = P.ground;
    g.fillRect(0, hy, w, h - hy);
    const hazeH = Math.max(5, Math.round(h * 0.018));
    g.fillStyle = P.haze;
    g.fillRect(0, hy - hazeH, w, hazeH);

    drawHills(g, w, hy, Math.floor(here.lon * 4 + here.lat * 4), P);
    drawCity(g, { nextCity: o.nextCity, compact, pal: P }, w, hy);

    const cx = w / 2;
    const zNear = (CAM_H * FOCAL) / Math.max(26, h - hy + 28);
    const zFar = VIEW;

    /* ---- 沿真实路线采样走向：算出每个纵深处路心的横向偏移（路才会弯） ---- */
    const prof = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const z = zNear + (zFar - zNear) * Math.pow(t, 1.55);
      const p = Geo.pointAtKm(route.points, route.cum, Math.min(total, dm + z / 1000));
      const dth = (p.heading - here.heading + 540) % 360 - 180;
      prof.push({ z, lat: 0, sin: Math.sin((dth * Math.PI) / 180) });
    }
    prof[0].lat = 0;
    for (let i = 1; i <= SAMPLES; i++) {
      prof[i].lat = prof[i - 1].lat + ((prof[i].sin + prof[i - 1].sin) / 2) * (prof[i].z - prof[i - 1].z);
    }
    const latAt = (z) => interp(prof, 'lat', z);
    const proj = (x, z) => {
      const zz = Math.max(z, 1.2);
      const sc = FOCAL / zz;
      return { x: cx + x * sc, y: hy + (CAM_H * FOCAL) / zz };
    };
    const poly = (pts) => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
    };
    const bandPath = (offsetFn, halfFn) => {
      const left = prof.map((s) => proj(offsetFn(s.lat) - halfFn(), s.z));
      const right = prof.map((s) => proj(offsetFn(s.lat) + halfFn(), s.z)).reverse();
      return left.concat(right);
    };

    /* ---- 地面：田野横纹（透视里的等距线条 = 速度感） ---- */
    g.fillStyle = P.furrow;
    for (let z = zNear; z < zFar; z += 36) {
      const y1 = proj(0, z).y;
      const y2 = proj(0, z + 1.1).y;
      if (y1 - y2 < 0.4 || y1 < hy + 2) continue;
      const hh = Math.max(1, y1 - y2);
      g.fillRect(0, y2, w, hh);
    }

    /* ---- 路肩 + 路面 ---- */
    poly(bandPath((l) => l, () => ROAD_HALF + VERGE));
    g.fillStyle = P.verge;
    g.fill();
    const roadPoly = bandPath((l) => l, () => ROAD_HALF);
    poly(roadPoly);
    g.fillStyle = T.road;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = T.roadEdge;
    g.stroke();

    /* ---- 路面中心线（唯一数据色：你正在走的行程） ---- */
    g.fillStyle = T.line;
    const startMeters = dm * 1000;
    const firstDash = Math.ceil((startMeters + 18) / 22) * 22;
    for (let s = firstDash; s < startMeters + VIEW; s += 22) {
      const zA = Math.max(18, s - startMeters);
      const zB = Math.min(zFar, s + 5 - startMeters);
      if (zB <= zA) continue;
      const a1 = proj(latAt(zA) - 0.24, zA);
      const b1 = proj(latAt(zB) - 0.24, zB);
      const b2 = proj(latAt(zB) + 0.24, zB);
      const a2 = proj(latAt(zA) + 0.24, zA);
      poly([a1, b1, b2, a2]);
      g.fill();
    }

    /* ---- 路边景物：远 → 近 ---- */
    const items = [];
    const push = (s, kind, extra) => items.push(Object.assign({ s, kind }, extra || {}));
    for (let s = Math.ceil((startMeters + 8) / 45) * 45; s < startMeters + VIEW; s += 45) push(s, 'pole');
    for (let s = Math.ceil((startMeters + 8) / 31) * 31; s < startMeters + VIEW; s += 31) push(s, 'tree');
    for (let s = Math.ceil((startMeters + 8) / 220) * 220; s < startMeters + VIEW; s += 220) push(s, 'post');
    (route.spots || []).forEach((sp) => {
      const s = (sp.atKm || 0) * 1000;
      if (s - startMeters > 8 && s - startMeters < VIEW) {
        push(s, 'spot', { spot: sp, visited: (o.visitedSpots || []).indexOf(sp.id) >= 0 });
      }
    });
    items.sort((a, b) => b.s - a.s);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    items.forEach((it) => {
      const z = it.s - startMeters;
      const minZ = it.kind === 'tree' ? 26 : it.kind === 'pole' ? 16 : 6;
      if (z < minZ || z > VIEW) return;
      const sc = FOCAL / z;
      const lat = latAt(z);
      const gy = proj(0, z).y;
      if (gy > h + 80) return;
      const seed = Math.floor(it.s / 10);

      if (it.kind === 'pole') {
        const px = cx + (lat + ROAD_HALF + VERGE + 1.5) * sc;
        const hp = 7.6 * sc;
        const wpx = Math.max(1, 0.3 * sc);
        g.fillStyle = P.pole;
        g.fillRect(px - wpx / 2, gy - hp, wpx, hp);
        g.fillRect(px - hp * 0.13, gy - hp + Math.max(1, 0.7 * sc), hp * 0.26, Math.max(1, 0.18 * sc));
        return;
      }

      if (it.kind === 'tree') {
        if (compact && hash01(seed + 91) > 0.45) return;
        const side = hash01(seed) < 0.5 ? -1 : 1;
        const off = ROAD_HALF + VERGE + 2 + hash01(seed + 7) * 10;
        const px = cx + (lat + side * off) * sc;
        const th = (3.6 + hash01(seed + 3) * 1.6) * sc;
        const tw = Math.max(0.8, 0.26 * sc);
        const r = (1.5 + hash01(seed + 11) * 1.3) * sc;
        g.fillStyle = P.pole;
        g.fillRect(px - tw / 2, gy - th, tw, th);
        g.beginPath();
        g.arc(px, gy - th - r * 0.5, Math.max(1.2, r), 0, Math.PI * 2);
        g.fillStyle = P.canopy;
        g.fill();
        return;
      }

      if (it.kind === 'post') {
        const px = cx + (lat + ROAD_HALF + VERGE + 0.9) * sc;
        const bw = 1.15 * sc;
        const bh = 0.85 * sc;
        const ph = 1.15 * sc;
        const tw = Math.max(0.8, 0.22 * sc);
        g.fillStyle = P.pole;
        g.fillRect(px - tw / 2, gy - ph - bh, tw, ph + bh);
        g.fillStyle = T.board;
        g.fillRect(px - bw / 2, gy - ph - bh, bw, bh);
        g.fillStyle = T.boardEdge;
        g.fillRect(px - bw / 2, gy - ph - bh + bh - Math.max(1, 0.12 * sc), bw, Math.max(1, 0.12 * sc));
        if (bw > 30) {
          g.fillStyle = T.ink;
          g.font = T.font;
          g.fillText(`${Math.round(it.s / 1000)}`, px, gy - ph - bh + bh / 2);
        }
        return;
      }

      if (it.kind === 'spot') {
        const px = cx + (lat + ROAD_HALF + VERGE + 1.6) * sc;
        const bw = 3.4 * sc;
        const bh = 1.15 * sc;
        const ph = 1.5 * sc;
        const tw = Math.max(1, 0.28 * sc);
        g.fillStyle = P.pole;
        g.fillRect(px - tw / 2, gy - ph - bh, tw, ph + bh);
        g.fillStyle = T.board;
        g.fillRect(px - bw / 2, gy - ph - bh, bw, bh);
        // 状态角标：已抵达 = 数据色实心，未抵达 = 空心
        const bw2 = Math.max(2, bw * 0.1);
        g.fillStyle = T.line;
        g.fillRect(px - bw / 2 + bw * 0.06, gy - ph - bh + bh * 0.22, bw2, bw2);
        if (bw > 74) {
          g.textAlign = 'left';
          g.fillStyle = T.ink;
          g.font = T.font;
          const label = it.spot.name || '';
          g.fillText(label, px - bw / 2 + bw * 0.22, gy - ph - bh + bh / 2);
          g.textAlign = 'center';
        }
      }
    });

    /* ---- 幽灵车（昨天的你）：同车道半透明剪影，领先你时出现在前方 ---- */
    if (o.ghost && o.ghost.aheadKm != null && o.ghost.aheadKm > -0.25) {
      const gz = 40 + Math.min(150, Math.max(0, o.ghost.aheadKm) * 25); // 领先越远越靠前
      const gsc = FOCAL / gz;
      const gy = proj(0, gz).y;
      const gx = cx + (latAt(gz) + 1.8) * gsc;
      const bw = 1.7 * gsc;   // 车长
      const bh = 1.1 * gsc;   // 车身高
      const wr = 0.34 * gsc;  // 轮径
      g.save();
      g.globalAlpha = 0.42;
      g.fillStyle = '#7c8593';
      g.fillRect(gx - bw / 2, gy - wr - bh, bw, bh);
      g.fillRect(gx - bw * 0.3, gy - wr - bh - bh * 0.5, bw * 0.6, bh * 0.55);
      g.beginPath();
      g.arc(gx - bw * 0.28, gy - wr, wr, 0, Math.PI * 2);
      g.arc(gx + bw * 0.28, gy - wr, wr, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    /* ---- 冲刺表现：速度线 + 路面扬尘（灰阶，不引入新彩色） ---- */
    if (o.boost && o.boost.whip) {
      g.save();
      g.strokeStyle = 'rgba(10, 10, 10, 0.10)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        const r1 = hash01(i * 37 + Math.floor(startMeters / 90));
        const y = hy + (h - hy) * (0.15 + r1 * 0.7);
        const len = 40 + r1 * 90;
        const x = i % 2 === 0 ? w * 0.04 + r1 * w * 0.16 : w * 0.96 - r1 * w * 0.16;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (i % 2 === 0 ? len : -len), y - len * 0.12);
        g.stroke();
      }
      g.fillStyle = 'rgba(107, 107, 107, 0.16)';
      for (let i = 0; i < 7; i++) {
        const r2 = hash01(i * 53 + Math.floor(startMeters / 60));
        const dw = 3 + r2 * 7;
        g.fillRect(w * 0.12 + r2 * w * 0.76, h - 4 - r2 * 14, dw, dw * 0.7);
      }
      g.restore();
    }

    // 弯道信息：前方 120m 路心横向偏移（米），供悬浮窗做「顺弯压弯」判定
    const lookLat = latAt(Math.min(120, zFar));
    return { bendDir: Math.sign(lookLat), bendMag: Math.abs(lookLat) };
  }

  window.SceneryKit = { render, terrainPalette };
})();
