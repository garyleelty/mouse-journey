'use strict';
/** 今日鼠标热力图：Canvas 径向渐变叠加 + 屏幕排布边框（配色与主窗口 tokens 一致） */
(function () {
  const T = {
    screen: '#eef0f4',
    screenEdge: '#d9dde5',
    label: '#6b6b6b',
    empty: '#6b6b6b',
    font: '12px Geist, Inter, system-ui, -apple-system, "PingFang SC", sans-serif',
    // 热力点：唯一的蓝（数据色 #1d5fbf 的低透明度），multiply 混合
    hot: 'rgba(29, 95, 191, 0.42)',
    warm: 'rgba(29, 95, 191, 0.16)',
    cur: '#0a0a0a'
  };

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{x:number,y:number}>} track 桌面坐标系下的采样点
   * @param {{originX:number,originY:number,width:number,height:number,displays:Array}} layout
   */
  function render(canvas, track, layout) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // 无数据：保留画框 + 一句话
    if (!track || !track.length) {
      g.fillStyle = T.empty;
      g.font = T.font;
      g.textAlign = 'center';
      g.fillText('今天还没有采集到鼠标移动', w / 2, h / 2);
      g.textAlign = 'left';
      return;
    }

    // 桌面坐标系 → 画布
    let scale = 1;
    let ox = 0;
    let oy = 0;
    if (layout && layout.width && layout.height) {
      const pad = 18;
      scale = Math.min((w - pad * 2) / layout.width, (h - pad * 2) / layout.height);
      ox = pad + ((w - pad * 2) - layout.width * scale) / 2 - layout.originX * scale;
      oy = pad + ((h - pad * 2) - layout.height * scale) / 2 - layout.originY * scale;
    } else {
      const xs = track.map((p) => p.x);
      const ys = track.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      scale = Math.min((w - 36) / bw, (h - 36) / bh);
      ox = 18 - minX * scale;
      oy = 18 - minY * scale;
    }
    const px = (v) => v * scale + ox;
    const py = (v) => v * scale + oy;

    // 显示器轮廓（作为"桌面"底图）
    if (layout && layout.displays) {
      layout.displays.forEach((d) => {
        const x = px(d.x);
        const y = py(d.y);
        const dw = d.w * scale;
        const dh = d.h * scale;
        g.fillStyle = T.screen;
        g.fillRect(x, y, dw, dh);
        g.strokeStyle = T.screenEdge;
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, dw - 1, dh - 1);
        g.fillStyle = T.label;
        g.font = T.font;
        const tag = d.primary ? '主屏' : (d.internal ? '内建' : `#${d.id}`);
        g.fillText(tag, x + 6, y + 14);
      });
    }

    // 热力叠加：径向渐变点阵（multiply，越密越亮）
    g.save();
    g.globalCompositeOperation = 'multiply';
    const radius = Math.max(6, 10 * Math.min(1.4, Math.max(0.5, scale / 1.2)));
    for (const p of track) {
      const x = px(p.x);
      const y = py(p.y);
      const grad = g.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, T.hot);
      grad.addColorStop(0.5, T.warm);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, radius, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // 当前位置标记（墨色小点 + 白环）
    const last = track[track.length - 1];
    if (last) {
      const x = px(last.x);
      const y = py(last.y);
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fillStyle = T.cur;
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.stroke();
    }
  }

  window.HeatMap = { render };
})();
