'use strict';
/** 地图绘制（主窗口与悬浮窗共用），纯 Canvas 2D，无任何在线地图依赖 */
(function () {
  // 配色与主窗口 tokens 一致：无彩色 chrome，唯一数据色只给「已走过的路线」
  const T = {
    land: '#eef0f4',
    landStroke: '#d9dde5',
    context: '#f3f4f7',
    contextStroke: '#e6e8ee',
    route: '#b9bec9',
    routeDone: '#1d5fbf',
    city: '#9a9fab',
    cityDone: '#0a0a0a',
    spot: '#1d5fbf',
    spotRing: '#ffffff',
    text: '#6b6b6b',
    halo: 'rgba(29, 95, 191, 0.14)',
    arrow: '#0a0a0a',
    font: '11px Geist, Inter, system-ui, -apple-system, "PingFang SC", sans-serif'
  };

  /**
   * @returns {{x:number,y:number}|null} 小人当前位置（画布 CSS 像素），供 SVG 标记层定位
   */
  function render(canvas, o) {
    if (!canvas) return null;
    // display:none 时 clientWidth 为 0：必须直接跳过。若回退到位图宽度，
    // 下面的位图重设会每帧按 dpr 指数膨胀，直到超出 Chromium 画布上限。
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return null;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const bbox = o.bbox;
    const proj = Geo.createProjector(bbox, w, h, o.compact ? 6 : 12);

    // 周边陆地（示意级环境参照，画在中国轮廓之下、更浅的底色）
    const drawLand = (rings, fill, stroke) => {
      for (const ring of rings || []) {
        g.beginPath();
        ring.forEach(([lon, lat], i) => {
          const p = proj.toXY(lon, lat);
          i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y);
        });
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = stroke;
        g.stroke();
      }
    };
    drawLand(o.context, T.context, T.contextStroke);

    // 陆地（中国）
    drawLand(o.rings, T.land, T.landStroke);

    const route = o.route;
    if (!route) return null;
    const pts = route.points.map((p) => proj.toXY(p.lon, p.lat));

    // 完整路线（虚线）
    if (o.showRoute !== false) {
      g.save();
      g.setLineDash(o.compact ? [3, 3] : [5, 4]);
      g.lineWidth = o.compact ? 1.2 : 1.6;
      g.strokeStyle = T.route;
      g.beginPath();
      pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.stroke();
      g.restore();
    }

    // 已走过的路段（实线，唯一数据色）
    const pr = Math.max(0, Math.min(route.totalKm, o.progressKm || 0));
    const donePts = [];
    for (let i = 0; i < route.points.length; i++) {
      if (route.cum[i] <= pr) donePts.push(pts[i]);
      else break;
    }
    const cur = Geo.pointAtKm(route.points, route.cum, pr);
    const curXY = proj.toXY(cur.lon, cur.lat);
    donePts.push(curXY);
    if (donePts.length > 1) {
      g.lineWidth = o.compact ? 2 : 2.6;
      g.strokeStyle = T.routeDone;
      g.lineCap = 'round';
      g.beginPath();
      donePts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.stroke();
    }

    // 城市
    const visited = new Set(o.visitedSpots || []);
    route.points.forEach((p, i) => {
      const xy = pts[i];
      const reached = route.cum[i] <= pr;
      g.beginPath();
      g.arc(xy.x, xy.y, o.compact ? 2 : 3, 0, Math.PI * 2);
      g.fillStyle = reached ? T.cityDone : T.city;
      g.fill();
      if (!o.compact) {
        g.fillStyle = T.text;
        g.font = T.font;
        g.fillText(p.name, xy.x + 5, xy.y - 4);
      }
    });

    // 景点（未抵达：空心；已抵达：实色）
    (route.spots || []).forEach((s) => {
      const xy = proj.toXY(s.lon, s.lat);
      const on = visited.has(s.id);
      g.beginPath();
      g.arc(xy.x, xy.y, o.compact ? 2.6 : 4, 0, Math.PI * 2);
      g.fillStyle = on ? T.spot : T.spotRing;
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = T.spot;
      g.stroke();
    });

    // 小人：光晕 + 方向箭头（外观由 HTML/SVG 标记层承载，见 main.js）
    g.save();
    g.beginPath();
    g.arc(curXY.x, curXY.y, o.compact ? 9 : 13, 0, Math.PI * 2);
    g.fillStyle = T.halo;
    g.fill();
    g.restore();

    const rad = ((o.heading || 0) * Math.PI) / 180;
    const r = o.compact ? 10 : 15;
    const ax = curXY.x + Math.sin(rad) * r;
    const ay = curXY.y - Math.cos(rad) * r;
    g.save();
    g.translate(ax, ay);
    g.rotate(rad);
    g.beginPath();
    g.moveTo(0, -4);
    g.lineTo(3.2, 3);
    g.lineTo(0, 1.4);
    g.lineTo(-3.2, 3);
    g.closePath();
    g.fillStyle = T.arrow;
    g.fill();
    g.restore();

    return { x: curXY.x, y: curXY.y };
  }

  window.MapKit = { render };
})();
