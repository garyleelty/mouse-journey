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
    hood: '#e8eaee',          // 引擎盖（比路面深半档）
    font: '600 10px Geist, Inter, system-ui, -apple-system, "PingFang SC", sans-serif'
  };
  const SHADOW = 'rgba(10, 10, 10, 0.08)';   // 投影（实色低透明，不引入渐变）
  const SHADOW_SOFT = 'rgba(10, 10, 10, 0.08)';

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

  /** 昼夜相位（真实本地时间驱动，不联网）：0=夜 1=白天，5-7/17-19 为晨昏过渡。
   *  hourF 可注入小时数（0-23，测试用）；不传则用真实本地时间。 */
  function daylight(hourF) {
    let h;
    if (hourF == null) {
      const d = new Date();
      h = d.getHours() + d.getMinutes() / 60;
    } else {
      h = hourF;
    }
    if (h >= 7 && h < 17) return 1;
    if (h >= 5 && h < 7) return (h - 5) / 2;
    if (h >= 17 && h < 19) return 1 - (h - 17) / 2;
    return 0;
  }
  const hexRgb2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lerpHex = (a, b, t) => {
    const A = hexRgb2(a), B = hexRgb2(b);
    return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
  };
  // 夜间色表（与白天同亮度层级，冷灰蓝；场景内容色，不属于 UI 数据色纪律）
  const NIGHT = {
    sky: '#1d2330', haze: '#272e3c', hillFar: '#242b38', hill: '#212734',
    ground: '#252b37', verge: '#2c323e', furrow: '#282e3a',
    pole: '#4a5262', canopy: '#39414f', city: '#333a48'
  };

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

  /** 第一人称座舱：随坐骑形态变化（剪影风，随相机侧倾整体转动）。
   *  speedKmh 为真实鼠标速度（km/h），显示在仪表上——真实数据进入场景。 */
  function drawCockpit(g, w, h, mountId, speedKmh) {
    if (mountId === 'walk') return; // 步行无座舱
    const inkA = (a) => `rgba(20, 22, 26, ${a})`;
    const dashY = h * 0.955;

    if (mountId === 'bike') {
      // 自行车：两侧车把弯向中央 + 把套 + 立管 + 小码表
      g.strokeStyle = inkA(0.92);
      g.lineCap = 'round';
      g.lineWidth = Math.max(8, h * 0.035);
      g.beginPath();
      g.moveTo(-w * 0.02, h + 4);
      g.quadraticCurveTo(w * 0.16, h * 0.93, w * 0.30, h * 0.965);
      g.stroke();
      g.beginPath();
      g.moveTo(w * 1.02, h + 4);
      g.quadraticCurveTo(w * 0.84, h * 0.93, w * 0.70, h * 0.965);
      g.stroke();
      g.lineWidth = Math.max(5, h * 0.022);
      g.beginPath();
      g.moveTo(w * 0.30, h * 0.965);
      g.quadraticCurveTo(w * 0.46, h * 0.9, w * 0.5, h * 0.985);
      g.stroke();
      g.beginPath();
      g.moveTo(w * 0.70, h * 0.965);
      g.quadraticCurveTo(w * 0.54, h * 0.9, w * 0.5, h * 0.985);
      g.stroke();
      g.fillStyle = inkA(0.95);
      g.fillRect(w * 0.275, h * 0.945, w * 0.055, h * 0.038);
      g.fillRect(w * 0.67, h * 0.945, w * 0.055, h * 0.038);
    } else {
      // 仪表台（公交/汽车/高铁/飞机）：全宽台面 + 中央速度表 + A 柱 + 后视镜
      g.fillStyle = inkA(0.94);
      g.beginPath();
      g.moveTo(-2, h + 2);
      g.lineTo(-2, h * 0.972);
      g.quadraticCurveTo(w * 0.5, h * 0.926, w + 2, h * 0.972);
      g.lineTo(w + 2, h + 2);
      g.closePath();
      g.fill();
      // A 柱：左右斜梁
      g.strokeStyle = inkA(0.94);
      g.lineWidth = Math.max(10, h * 0.03);
      g.beginPath();
      g.moveTo(w * 0.015, h * 0.44);
      g.lineTo(w * 0.10, h + 2);
      g.moveTo(w * 0.985, h * 0.44);
      g.lineTo(w * 0.90, h + 2);
      g.stroke();
      // 中央速度表：真实速度（km/h）
      const cx = w * 0.5;
      const cy = h * 0.968;
      const R = Math.max(26, h * 0.075);
      g.fillStyle = inkA(0.97);
      g.beginPath();
      g.arc(cx, cy, R * 1.12, Math.PI, 0);
      g.closePath();
      g.fill();
      g.fillStyle = '#f5f6f8';
      g.beginPath();
      g.arc(cx, cy, R, Math.PI, 0);
      g.closePath();
      g.fill();
      // 刻度（0..120，每 20 一格）
      g.strokeStyle = '#b4bbc7';
      g.lineWidth = 2;
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82);
        g.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
        g.stroke();
      }
      // 指针（数据色）+ 数字
      const frac = Math.max(0, Math.min(1, speedKmh / 120));
      const na = Math.PI + frac * Math.PI;
      g.strokeStyle = '#1d5fbf';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(na) * R * 0.78, cy + Math.sin(na) * R * 0.78);
      g.stroke();
      g.fillStyle = '#1d5fbf';
      g.font = `700 ${Math.max(11, R * 0.4).toFixed(0)}px Geist, Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`${Math.round(speedKmh)}`, cx, cy - R * 0.42);
      g.fillStyle = '#6b6b6b';
      g.font = `500 ${Math.max(7, R * 0.18).toFixed(0)}px Geist, Inter, system-ui, sans-serif`;
      g.fillText('km/h', cx, cy - R * 0.06);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    }
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

    // 地貌配色：由当前位置的经纬度确定性算出（跨区线性过渡）；
    // 再按昼夜相位向夜间色表插值（真实本地时间驱动，不联网）
    const dayT = daylight(o.hour == null ? null : o.hour);
    const nightT = 1 - dayT;
    const P0 = terrainPalette(here.lon, here.lat);
    const P = {};
    for (const k in P0) P[k] = NIGHT[k] ? lerpHex(P0[k], NIGHT[k], nightT) : P0[k];
    const roadCol = lerpHex(T.road, '#39404e', nightT);
    const roadEdgeCol = lerpHex(T.roadEdge, '#4a5160', nightT);

    // 天地：分层实色（无渐变），随地貌渐变
    g.fillStyle = P.sky;
    g.fillRect(0, 0, w, hy);
    // 太阳（右上，两层同心实色圆）与云（确定性定位，随里程缓慢漂移）；夜里换月牙与星星
    if (nightT > 0.5) {
      g.fillStyle = `rgba(226, 232, 240, ${0.9 * nightT})`;
      g.beginPath();
      g.arc(w * 0.76, hy * 0.24, Math.max(9, hy * 0.055), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = P.sky; // 盖出月牙
      g.beginPath();
      g.arc(w * 0.76 + Math.max(4, hy * 0.026), hy * 0.24 - Math.max(2, hy * 0.014), Math.max(8, hy * 0.048), 0, Math.PI * 2);
      g.fill();
      for (let st = 0; st < 34; st++) {
        const r1 = hash01(st * 131 + 7);
        const r2 = hash01(st * 173 + 11);
        g.fillStyle = `rgba(226, 232, 240, ${(0.25 + r2 * 0.6) * nightT})`;
        g.fillRect(r1 * w, hy * r2 * 0.85, 1.5, 1.5);
      }
    } else {
      const sunX = w * 0.78;
      const sunY = hy * 0.22;
      g.fillStyle = `rgba(255, 253, 244, ${0.9 * dayT + 0.1})`;
      g.beginPath();
      g.arc(sunX, sunY, Math.max(10, hy * 0.07), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(255, 253, 244, ${0.45 * dayT + 0.1})`;
      g.beginPath();
      g.arc(sunX, sunY, Math.max(16, hy * 0.12), 0, Math.PI * 2);
      g.fill();
    }
    const cloudBase = Math.floor(dm * 1000 / 900); // 每 900 m 云形缓变
    for (let c = 0; c < 3; c++) {
      const r1 = hash01(cloudBase * 7 + c * 13);
      const r2 = hash01(cloudBase * 7 + c * 29);
      const cxp = ((r1 * 1.4 - 0.2) * w + (dm * 1000 % 900) / 900 * w * 0.3) % (w + 120) - 60;
      const cyp = hy * (0.12 + r2 * 0.3);
      const cs = Math.max(8, hy * (0.05 + r1 * 0.05));
      g.fillStyle = lerpHex('#ffffff', '#9aa5b5', nightT).replace('#', '#') ;
      g.globalAlpha = 0.9 - nightT * 0.55;
      g.beginPath();
      g.ellipse(cxp, cyp, cs * 1.9, cs * 0.62, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(cxp - cs * 0.7, cyp + cs * 0.1, cs * 1.1, cs * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(cxp + cs * 0.8, cyp + cs * 0.08, cs * 1.0, cs * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = lerpHex('#8c96a6', '#565f6e', nightT);
      g.globalAlpha = 0.4;
      g.beginPath();
      g.ellipse(cxp, cyp + cs * 0.42, cs * 1.5, cs * 0.2, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = P.ground;
    g.fillRect(0, hy, w, h - hy);
    const hazeH = Math.max(5, Math.round(h * 0.018));
    g.fillStyle = P.haze;
    g.fillRect(0, hy - hazeH, w, hazeH);

    drawHills(g, w, hy, Math.floor(here.lon * 4 + here.lat * 4), P);
    drawCity(g, { nextCity: o.nextCity, compact, pal: P }, w, hy);

    // 田野色块：远 ground 上按里程确定性分块（复垦感），路面覆盖其中间
    if (!compact) {
      const blockH = Math.max(10, (h - hy) * 0.09);
      for (let bi = 0; bi < 26; bi++) {
        const r = hash01(Math.floor(dm * 1000 / 120) * 31 + bi);
        if (r < 0.35) continue;
        const bx = ((bi * 97 + Math.floor(dm * 1000 / 120) * 53) % 130 - 15) / 100 * w;
        const by = hy + (bi % 3) * blockH * 0.9 + 2;
        g.fillStyle = r > 0.72 ? P.furrow : (r > 0.52 ? P.hillFar : P.verge);
        g.globalAlpha = 0.5;
        g.fillRect(bx, by, w * (0.12 + r * 0.2), blockH * (0.6 + r * 0.6));
        g.globalAlpha = 1;
      }
    }

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
    g.fillStyle = roadCol;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = roadEdgeCol;
    g.stroke();

    /* ---- 车灯光锥（夜间）：照亮前方路面，中心线在光上更醒目 ---- */
    if (nightT > 0.4) {
      const zN = 5;
      const zF = 17;
      const yN = proj(0, zN).y + 6;
      const yF = proj(0, zF).y;
      const wN = ROAD_HALF * (FOCAL / zN);
      const wF = ROAD_HALF * (FOCAL / zF);
      g.fillStyle = `rgba(255, 244, 210, ${0.11 * nightT})`;
      g.beginPath();
      g.moveTo(cx - wN, yN);
      g.lineTo(cx - wF, yF);
      g.lineTo(cx + wF, yF);
      g.lineTo(cx + wN, yN);
      g.closePath();
      g.fill();
    }

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
    const poleTops = []; // 电线：相邻杆顶连线（远→近）
    const shadowCol = `rgba(10, 10, 10, ${(0.08 * (0.3 + 0.7 * dayT)).toFixed(3)})`; // 夜里影淡（月光影）
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
        // 投影：太阳在右上，影向左下贴地
        g.fillStyle = shadowCol;
        g.beginPath();
        g.ellipse(px - hp * 0.45, gy + Math.max(1, 0.12 * sc), hp * 0.55, Math.max(1, 0.09 * sc), 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = P.pole;
        g.fillRect(px - wpx / 2, gy - hp, wpx, hp);
        g.fillRect(px - hp * 0.13, gy - hp + Math.max(1, 0.7 * sc), hp * 0.26, Math.max(1, 0.18 * sc));
        if (nightT > 0.5) {
          g.fillStyle = `rgba(255, 240, 200, ${0.55 * nightT})`;
          g.beginPath();
          g.arc(px, gy - hp - Math.max(2, 0.5 * sc), Math.max(2.5, 0.9 * sc), 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(255, 240, 200, ${0.07 * nightT})`;
          g.beginPath();
          g.ellipse(px, gy, Math.max(6, 2.6 * sc), Math.max(2, 0.6 * sc), 0, 0, Math.PI * 2);
          g.fill();
        }
        poleTops.push({ x: px, y: gy - hp, sc });
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
        g.fillStyle = shadowCol;
        g.beginPath();
        g.ellipse(px - th * 0.55, gy + Math.max(1, th * 0.05), th * 0.8, Math.max(1, th * 0.11), 0, 0, Math.PI * 2);
        g.fill();
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
        g.fillStyle = shadowCol;
        g.beginPath();
        g.ellipse(px - bw * 0.7, gy + Math.max(1, 0.05 * sc), bw * 1.3, Math.max(1, 0.07 * sc), 0, 0, Math.PI * 2);
        g.fill();
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

    /* ---- 电线：相邻电线杆顶之间，带下垂的悬链线（简化二次曲线） ---- */
    g.strokeStyle = P.pole;
    g.lineWidth = 1.2;
    g.globalAlpha = 0.8;
    for (let wi = 0; wi < poleTops.length - 1; wi++) {
      const a = poleTops[wi];
      const b = poleTops[wi + 1];
      if (b.x - a.x < 4 || a.y < hy + 4) continue; // 太远/在雾线以上不画
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 + Math.min(34, (b.sc || 1) * 1.6);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.quadraticCurveTo(mx, my, b.x, b.y);
      g.stroke();
    }
    g.globalAlpha = 1;

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

    // 第一人称座舱（主窗）：最后画 = 最贴近镜头；在 roll 变换内，随侧倾/冲刺抖动整体转动
    if (!compact) drawCockpit(g, w, h, o.mountId || 'car', o.speedKmh || 0);

    // 弯道信息：前方 120m 路心横向偏移（米），供悬浮窗做「顺弯压弯」判定
    const lookLat = latAt(Math.min(120, zFar));
    return { bendDir: Math.sign(lookLat), bendMag: Math.abs(lookLat) };
  }

  window.SceneryKit = { render, terrainPalette };
})();
