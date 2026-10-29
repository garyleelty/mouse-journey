'use strict';
/** SVG 图表（app-screens.md §6 规则）：
 *  方角柱 · 单一色相 · 横向网格线 3-5 条 · 无 Y 轴线 · 基线加重 ·
 *  左侧刻度 12px 灰 · X 标签平排 ≤8 个 · 单序列不画图例 · 零值诚实绘制 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  function niceStep(raw) {
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
    for (const s of steps) if (raw <= s) return s;
    return 100000;
  }

  /** 数字标签：刻度用整数，大数缩写 */
  function tickLabel(v) {
    if (v >= 10000) return `${(v / 1000).toFixed(0)}k`;
    if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(Math.round(v));
  }

  /**
   * @param {HTMLElement} el 容器（.chart）
   * @param {Array<{key:string,label:string,value:number,moves:number,activeMs:number}>} data
   * @param {{tip?:HTMLElement, hue?:string, emptyText?:string}} opts
   */
  function bars(el, data, opts = {}) {
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight || 220;
    if (!w) return;

    const hue = opts.hue || '#1d5fbf';
    const grid = '#e5e5e5';
    const muted = '#6b6b6b';
    const base = '#d4d4d4';

    const max = Math.max(0, ...data.map((d) => d.value));
    const step = niceStep(max / 4);
    const ticks = Math.max(1, Math.ceil(max / step));
    const niceMax = ticks * step;

    const pad = { l: 40, r: 12, t: 10, b: 24 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const slot = iw / Math.max(1, data.length);
    const bw = Math.max(3, Math.min(48, slot * 0.62));

    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Geist, Inter, system-ui, sans-serif">`;

    // 网格线（横向，不含基线）
    for (let i = 1; i <= ticks; i++) {
      const y = pad.t + ih - (ih * i * step) / niceMax;
      s += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${w - pad.r}" y2="${y.toFixed(1)}" stroke="${grid}" stroke-width="1"/>`;
      s += `<text x="${pad.l - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${muted}">${tickLabel(i * step)}</text>`;
    }
    // 0 刻度 + 加重基线
    s += `<text x="${pad.l - 8}" y="${(pad.t + ih + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${muted}">0</text>`;
    s += `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${w - pad.r}" y2="${pad.t + ih}" stroke="${base}" stroke-width="1"/>`;

    // X 标签：≤8 个，首尾内收
    const n = data.length;
    const labelIdx = new Set();
    if (n <= 8) for (let i = 0; i < n; i++) labelIdx.add(i);
    else {
      const count = 6;
      for (let i = 0; i < count; i++) labelIdx.add(Math.round((i * (n - 1)) / (count - 1)));
    }

    data.forEach((d, i) => {
      const cx = pad.l + slot * (i + 0.5);
      const bh = niceMax > 0 ? (d.value / niceMax) * ih : 0;
      if (bh > 0.5) {
        s += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(pad.t + ih - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${hue}"><title></title></rect>`;
      }
      if (labelIdx.has(i)) {
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        s += `<text x="${cx.toFixed(1)}" y="${h - 6}" text-anchor="${anchor}" font-size="12" fill="${muted}">${d.label}</text>`;
      }
      // 命中区（整槽）
      s += `<rect class="hit" data-i="${i}" x="${(pad.l + slot * i).toFixed(1)}" y="${pad.t}" width="${slot.toFixed(1)}" height="${ih + pad.b}" fill="transparent"/>`;
    });

    s += '</svg>';
    el.innerHTML = s;

    // hover → tooltip（mouseleave 只绑一次：bars 以 2Hz 重建 SVG，每次 addEventListener 会无限泄漏）
    const tip = opts.tip;
    if (el._chartHide) el.removeEventListener('mouseleave', el._chartHide);
    const hits = el.querySelectorAll('.hit');
    const show = (i) => {
      const d = data[i];
      if (!d) return;
      if (tip) {
        tip.hidden = false;
        tip.innerHTML = `<b>${d.key}</b>${Fmt.weekdayLabel(d.key)}<br><span class="tip-sub">距离 ${Fmt.formatDistance(d.value)} · 移动 ${d.moves.toLocaleString()} 次 · 活跃 ${Fmt.formatDuration(d.activeMs)}</span>`;
        const cx = pad.l + slot * (i + 0.5);
        tip.style.left = `${Math.max(4, Math.min(w - tip.offsetWidth - 4, cx - tip.offsetWidth / 2))}px`;
        tip.style.top = '4px';
      }
    };
    const hide = () => { if (tip) tip.hidden = true; };
    hits.forEach((r) => {
      r.addEventListener('mouseenter', () => show(Number(r.dataset.i)));
      r.addEventListener('mousemove', () => show(Number(r.dataset.i)));
    });
    el._chartHide = hide;
    el.addEventListener('mouseleave', hide);
  }

  window.Charts = { bars };
})();
