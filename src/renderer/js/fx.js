'use strict';
/**
 * FXKit —— 庆祝动效（轻量彩带）。纪律与场景层一致：
 * 灰阶 + 唯一数据色 #1d5fbf，不引入新彩色；pointer-events:none 不挡交互；
 * 粒子跑完自动停 rAF；系统「减弱动态效果」时完全不动。
 */
(function () {
  const COLORS = ['#1d5fbf', '#0a0a0a', '#6b6b6b', '#c3c8d2', '#f2f4f7'];
  const MAX_PARTS = 500;

  let canvas = null, ctx = null, parts = [], raf = 0, last = 0;

  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'fx-confetti';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:70';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);
  }

  function tick(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => (p.t += dt) < p.life && p.y < innerHeight + 24);
    for (const p of parts) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 0.7 * dt;
      p.r += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, Math.min(1, 2.2 * (1 - p.t / p.life)));
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (parts.length) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  /**
   * 从 (x, y) 炸一小把彩带（默认屏幕中上方）。全部坐标为视口 CSS 像素。
   * opts: { x, y, count = 80, spread = π*0.9, power = 1 }
   */
  function confetti(opts) {
    const o = opts || {};
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ensure();
    if (parts.length > MAX_PARTS) return; // 连环庆祝也不堆积
    const x = o.x != null ? o.x : innerWidth / 2;
    const y = o.y != null ? o.y : innerHeight * 0.36;
    const count = o.count || 80;
    const spread = o.spread != null ? o.spread : Math.PI * 0.9;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const v = (300 + Math.random() * 420) * (o.power || 1);
      parts.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        g: 980,
        w: 4 + Math.random() * 5,
        h: 7 + Math.random() * 9,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 14,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1.3 + Math.random() * 0.9,
        t: 0
      });
    }
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(tick);
    }
  }

  /** 从某个元素中心炸（toast 图标冒彩带用） */
  function burstFromEl(el, opts) {
    if (!el || !el.getBoundingClientRect) return confetti(opts);
    const r = el.getBoundingClientRect();
    return confetti(Object.assign({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, opts || {}));
  }

  window.FX = { confetti, burstFromEl };
})();
