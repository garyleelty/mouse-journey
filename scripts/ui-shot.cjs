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
  if (TAB) {
    // 走真实 UI 路径切页（复用 switchTab 的渲染链路）
    await win.webContents.executeJavaScript(
      `document.querySelector('.nav-item[data-tab="${TAB}"]').click()`
    );
  }
  await new Promise((r) => setTimeout(r, 1800)); // 等字体与 rAF 场景循环出画
  if (process.env.MJ_DEBUG) {
    const info = await win.webContents.executeJavaScript(
      `JSON.stringify({ dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight,` +
      ` fw: document.getElementById('fw') && document.getElementById('fw').getBoundingClientRect(),` +
      ` fh: document.getElementById('fh') && document.getElementById('fh').getBoundingClientRect() })`
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
