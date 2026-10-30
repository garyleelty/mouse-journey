'use strict';
/**
 * UI 截图 harness：用 stub preload 渲染主窗口（today 页）并截图，主进程业务零参与。
 * 用法：env -u ELECTRON_RUN_AS_NODE npx electron scripts/ui-shot.cjs [输出.png]
 * 配合 ui-preload.cjs 顶部的 MJ_* 环境变量可截不同玩法状态。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const out = process.argv[2] || '/tmp/mj-ui/today.png';
const PAGE = process.env.MJ_PAGE === 'float' ? 'float.html' : 'index.html';
const TAB = process.env.MJ_TAB || '';
const IS_FLOAT = PAGE === 'float.html';
const W = Number(process.env.MJ_W || (IS_FLOAT ? 300 : 1360));
const H = Number(process.env.MJ_H || (IS_FLOAT ? 246 : 900));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true, // MJ_W/MJ_H 直接对应 CSS 内容区（否则被原生标题栏吃掉一截）
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'ui-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // stub preload 需要 require 共享模块（geo.js）
      backgroundThrottling: false
    }
  });
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.error(`[renderer:${level}] ${message} (${source}:${line})`);
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', PAGE));
  if (process.env.MJ_FRESH) {
    await win.webContents.executeJavaScript('localStorage.clear()'); // 排除跨运行的持久化状态
  }
  if (TAB) {
    // 走真实 UI 路径切页（复用 switchTab 的渲染链路）
    await win.webContents.executeJavaScript(
      `document.querySelector('.nav-item[data-tab="${TAB}"]').click()`
    );
  }
  if (process.env.MJ_RANGE) {
    // 统计页区间切换（复用真实 seg-btn 点击链路）
    await win.webContents.executeJavaScript(
      `document.querySelector('#stats-range .seg-btn[data-range="${process.env.MJ_RANGE}"]').click()`
    );
  }
  if (process.env.MJ_CLICK) {
    // 真实点击验证交互闭环：'toast' 等 900ms 注入的可跳转 toast；其它值当作元素 id（如 milestone）
    const v = process.env.MJ_CLICK;
    const sel = v === 'toast' ? '.toast.link' : (v.startsWith('.') || v.startsWith('#') ? v : `#${v}`);
    const r = await win.webContents.executeJavaScript(
      `(async () => {
        for (let i = 0; i < 20; i++) {
          const t = document.querySelector(${JSON.stringify(sel)});
          // SVG 元素没有 .click() 方法，统一用 MouseEvent 派发（HTML/SVG 通用）
          if (t) { t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'clicked'; }
          await new Promise((r2) => setTimeout(r2, 150));
        }
        return 'no-target';
      })()`
    );
    console.log('click:', r);
  }
  await new Promise((r) => setTimeout(r, Number(process.env.MJ_WAIT || 1800))); // 等字体与 rAF 场景循环出画（可缩短以捕捉 transient 动画）
  if (process.env.MJ_DEBUG) {
    const info = await win.webContents.executeJavaScript(
      `JSON.stringify({ dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight,` +
      ` fw: document.getElementById('fw') && document.getElementById('fw').getBoundingClientRect(),` +
      ` fh: document.getElementById('fh') && document.getElementById('fh').getBoundingClientRect(),` +
      ` gr: (() => { const el = document.getElementById('goal-ring'); if (!el) return 'missing';` +
      ` const cs = getComputedStyle(el); return { hidden: el.hidden, disp: cs.display, pos: cs.position, w: cs.width, rect: el.getBoundingClientRect() }; })(),` +
      ` goalDebug: (() => { try { const s = S.state; return { goal: s.settings.goal, today: s.today.meters,` +
      ` done: localStorage.getItem('mj-goal-done'), toasts: document.querySelectorAll('.toast').length }; } catch (e) { return 'ERR:' + e.message; } })() })`
    );
    console.log('layout', info);
  }
  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.toPNG());
  const s = img.getSize();
  console.log(`saved ${out} ${s.width}x${s.height}`);
  app.quit();
}).catch((e) => {
  console.error(e);
  app.exit(1);
});
