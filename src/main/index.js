'use strict';

const path = require('node:path');
const fs = require('node:fs');
const {
  app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, Notification, systemPreferences
} = require('electron');

const Store = require('./store');
const Tracker = require('./tracker');
const { Journey } = require('./journey');
const { Achievements } = require('./achievements');
const Health = require('./health');
const { registerIpc } = require('./ipc');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const DEV = process.argv.includes('--dev');

const FLOAT_EXPANDED = { width: 300, height: 246 };
const FLOAT_COLLAPSED = { width: 196, height: 46 };
const PUSH_INTERVAL_MS = 500;

const ctx = {};

function loadHtml(name) {
  return path.join(__dirname, '../renderer', name);
}

/** 开发模式（--dev）下把渲染进程的 console / 加载失败输出镜像到主进程控制台 */
function attachConsoleMirror(win, tag) {
  if (!DEV) return;
  // Electron ≥ 36：参数为事件对象（level / message / lineNumber / sourceId）
  win.webContents.on('console-message', (e) => {
    const p = (e && e.message != null) ? e : {};
    console.log(`[renderer:${tag}:${p.level}] ${p.message} (${p.sourceId}:${p.lineNumber})`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer:${tag}] 加载失败 ${url} → ${desc} (${code})`);
  });
  win.webContents.on('preload-error', (_e, path, error) => {
    console.error(`[renderer:${tag}] preload 错误 ${path} → ${error.message}`);
  });
}

function commonWebPreferences() {
  return {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    backgroundThrottling: false
  };
}

/* ------------------------------------------------------------------ 窗口 */

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 880,
    minHeight: 600,
    title: 'MouseJourney · 鼠标旅行',
    backgroundColor: '#f6f7fb',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: IS_MAC ? { x: 14, y: 14 } : undefined,
    show: false,
    webPreferences: commonWebPreferences()
  });
  win.loadFile(loadHtml('index.html'));
  attachConsoleMirror(win, 'main');
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    if (ctx.store.settings.general.closeToTray && !ctx.quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

function defaultFloatPosition(size) {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(wa.x + wa.width - size.width - 16),
    y: Math.round(wa.y + 16)
  };
}

function createFloatWindow() {
  const s = ctx.store.settings.float;
  const size = s.collapsed ? FLOAT_COLLAPSED : FLOAT_EXPANDED;
  const pos = defaultFloatPosition(size);

  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: s.x != null ? s.x : pos.x,
    y: s.y != null ? s.y : pos.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: IS_MAC ? true : false,
    title: 'MouseJourney 悬浮窗',
    show: false,
    webPreferences: commonWebPreferences()
  });

  win.loadFile(loadHtml('float.html'));
  attachConsoleMirror(win, 'float');
  win.once('ready-to-show', () => {
    if (ctx.store.settings.float.visible) win.show();
  });

  win.setAlwaysOnTop(true, s.alwaysOnTopLevel || 'floating');
  if (s.opacity) win.setOpacity(s.opacity);

  if (IS_MAC) {
    // 允许出现在所有桌面空间（含全屏应用之上，需配合 alwaysOnTop 级别）
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: (s.alwaysOnTopLevel || 'floating') === 'screen-saver' });
    } catch (_) { /* 部分系统版本不支持 */ }
  }

  // 记住位置（始终把右边缘留在屏幕内）
  let moveTimer = null;
  win.on('moved', () => {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      const b = win.getBounds();
      ctx.store.updateSettings({ float: { x: b.x, y: b.y } });
    }, 400);
  });

  return win;
}

function resizeFloat(collapsed) {
  const win = ctx.float;
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const size = collapsed ? FLOAT_COLLAPSED : FLOAT_EXPANDED;
  win.setResizable(true);
  win.setSize(size.width, size.height, false);
  win.setResizable(false);
  // 保持右上角对齐，避免折叠后悬空
  const wa = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  let x = b.x + (b.width - size.width);
  x = Math.max(wa.x, Math.min(wa.x + wa.width - size.width, x));
  const y = Math.max(wa.y, Math.min(wa.y + wa.height - size.height, b.y));
  win.setPosition(Math.round(x), Math.round(y));
  ctx.store.updateSettings({ float: { x: Math.round(x), y: Math.round(y) } });
}

/** 显示器插拔 / 分辨率变化后，把悬浮窗拉回可见区域 */
function ensureFloatVisible() {
  const win = ctx.float;
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const wa = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  if (!wa) return;
  const intersects = b.x < wa.x + wa.width && b.x + b.width > wa.x && b.y < wa.y + wa.height && b.y + b.height > wa.y;
  if (!intersects) {
    const p = defaultFloatPosition(b);
    win.setPosition(p.x, p.y);
    ctx.store.updateSettings({ float: { x: p.x, y: p.y } });
  }
}

function createReminderWindow(payload) {
  if (ctx.reminder && !ctx.reminder.isDestroyed()) {
    const wc = ctx.reminder.webContents;
    ctx.reminder.focus();
    // 窗口可能还在加载（复用路径），等加载完再推 payload，避免消息被吞
    if (wc.isLoading()) {
      wc.once('did-finish-load', () => {
        if (!ctx.reminder.isDestroyed()) wc.send('reminder:show', payload);
      });
    } else {
      wc.send('reminder:show', payload);
    }
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    width: 420,
    height: 260,
    x: Math.round(wa.x + (wa.width - 420) / 2),
    y: Math.round(wa.y + (wa.height - 260) / 2),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: '休息提醒',
    backgroundColor: '#ffffff',
    webPreferences: commonWebPreferences()
  });
  win.loadFile(loadHtml('reminder.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send('reminder:show', payload);
    }, 60);
  });
  win.on('closed', () => { ctx.reminder = null; });
  ctx.reminder = win;
}

/* ------------------------------------------------------------------ 托盘 */

function createTray() {
  const iconPath = path.join(__dirname, '../../build/tray.png');
  let icon;
  if (fs.existsSync(iconPath)) icon = nativeImage.createFromPath(iconPath);
  if (!icon || icon.isEmpty()) {
    // 未生成图标时托盘不可用，不影响主功能
    console.warn('[tray] 未找到 build/tray.png，跳过托盘（执行 npm run icon 生成）');
    return null;
  }
  if (IS_MAC) icon = icon.resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  tray.setToolTip('MouseJourney · 鼠标旅行');
  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: `今日 ${(ctx.store.today().distanceCm / 100).toFixed(1)} m`, enabled: false },
      { type: 'separator' },
      { label: '打开主窗口', click: () => ctx.showMain() },
      {
        label: ctx.tracker.paused ? '继续记录' : '暂停记录',
        click: () => (ctx.tracker.paused ? ctx.tracker._resume('user') : ctx.tracker._pause('user'))
      },
      {
        label: ctx.store.settings.float.visible ? '隐藏悬浮窗' : '显示悬浮窗',
        click: () => {
          const v = !ctx.store.settings.float.visible;
          ctx.store.updateSettings({ float: { visible: v } });
          if (!ctx.float || ctx.float.isDestroyed()) return;
          v ? ctx.float.show() : ctx.float.hide();
          rebuild();
        }
      },
      { type: 'separator' },
      { label: '退出', click: () => { ctx.quitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
  };
  rebuild();
  tray.on('click', () => ctx.showMain());
  ctx.rebuildTray = rebuild;
  return tray;
}

/* ------------------------------------------------------------------ 组装 */

function setupTrackerCallbacks() {
  const { tracker, journey, health, achievements } = ctx;

  let lastPush = 0;
  let lastAchievementCheck = 0;

  tracker.on('tick', (t) => {
    // 1) 里程推进
    if (t.deltaCm > 0) {
      const events = journey.addMeters(t.deltaCm / 100);
      for (const ev of events) {
        ctx.broadcast('journey:event', ev);
        // 旅程事件（景点/完赛）低频且与旅程相关，不走健康提醒的通知开关
        if (ev.type === 'spot') {
          maybeNotify(`恭喜你抵达${ev.payload.name} 🎉`, ev.payload.intro);
        }
        if (ev.type === 'complete') {
          maybeNotify('旅程达成 🏁', `你已完成「${ev.payload.routeName}」，全程 ${ev.payload.totalKm} 公里！`);
        }
      }
    }

    // 2) 健康提醒
    const remind = health.onTick(t);
    if (remind) {
      ctx.broadcast('health:reminder', remind);
      ctx.openReminder(remind);
      if (ctx.store.settings.health.useNotification) maybeNotify(remind.title, remind.message);
    }

    // 3) 成就（每 10s 检查一次即可）
    const now = Date.now();
    if (now - lastAchievementCheck > 10_000) {
      lastAchievementCheck = now;
      const fresh = achievements.check();
      for (const a of fresh) {
        ctx.broadcast('achievement', a);
        maybeNotify(`成就解锁 ${a.icon} ${a.name}`, a.desc);
      }
    }

    // 4) 推送状态（节流）
    if (now - lastPush >= PUSH_INTERVAL_MS) {
      lastPush = now;
      ctx.broadcast('state:update', ctx.buildState(false));
    }
  });

  tracker.on('paused', () => health.reset());
  tracker.on('resumed', () => health.reset());
  tracker.on('day', () => {
    ctx.store.pruneTrack(14); // 只保留最近 14 天的轨迹点
    ctx.broadcast('state:full', ctx.buildState(true));
    if (ctx.rebuildTray) ctx.rebuildTray();
  });
}

function maybeNotify(title, body) {
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title, body, silent: true }).show();
  } catch (_) { /* 忽略通知失败 */ }
}

function boot() {
  ctx.store = new Store();
  ctx.tracker = new Tracker(ctx.store);
  ctx.journey = new Journey(ctx.store);
  ctx.achievements = new Achievements(ctx.store);
  ctx.health = new Health(ctx.store);

  ctx.broadcast = (channel, payload) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed() && w.webContents) w.webContents.send(channel, payload);
    }
  };
  ctx.buildState = (full) => require('./ipc').buildState(ctx, full);
  ctx.showMain = () => {
    if (!ctx.main || ctx.main.isDestroyed()) ctx.main = createMainWindow();
    else if (ctx.main.isMinimized()) ctx.main.restore();
    ctx.main.show();
    ctx.main.focus();
  };
  ctx.openReminder = createReminderWindow;
  ctx.resizeFloat = resizeFloat;
  ctx.setLoginItem = (open) => {
    app.setLoginItemSettings({ openAtLogin: !!open, openAsHidden: true });
  };

  // 桌面布局（虚拟桌面坐标系），供热力图渲染：把所有显示器的 workArea 归一到同一坐标系
  ctx.screenLayout = () => {
    const displays = screen.getAllDisplays();
    if (!displays.length) return null;
    const bounds = displays.reduce((acc, d) => ({
      minX: Math.min(acc.minX, d.bounds.x),
      minY: Math.min(acc.minY, d.bounds.y),
      maxX: Math.max(acc.maxX, d.bounds.x + d.bounds.width),
      maxY: Math.max(acc.maxY, d.bounds.y + d.bounds.height)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    return {
      originX: bounds.minX,
      originY: bounds.minY,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      displays: displays.map((d) => ({
        id: d.id,
        primary: d.id === screen.getPrimaryDisplay().id,
        internal: !!d.internal,
        x: d.bounds.x - bounds.minX,
        y: d.bounds.y - bounds.minY,
        w: d.bounds.width,
        h: d.bounds.height
      }))
    };
  };

  ctx.main = createMainWindow();
  ctx.float = createFloatWindow();
  ensureFloatVisible(); // 开机即校验：保存的坐标可能指向已拔掉的显示器，避免悬浮窗落在屏幕外

  const { pushFull } = registerIpc(ctx);
  ctx.pushFull = pushFull;
  ctx.applyFloatSettings = (before, after) => {
    const f = after.float;
    if (!ctx.float || ctx.float.isDestroyed()) return;
    if (before.float.opacity !== f.opacity) ctx.float.setOpacity(f.opacity);
    if (before.float.alwaysOnTopLevel !== f.alwaysOnTopLevel) {
      ctx.float.setAlwaysOnTop(true, f.alwaysOnTopLevel || 'floating');
      if (IS_MAC) {
        try {
          ctx.float.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: f.alwaysOnTopLevel === 'screen-saver' });
        } catch (_) { /* noop */ }
      }
    }
    if (before.float.visible !== f.visible) f.visible ? ctx.float.show() : ctx.float.hide();
  };

  ctx.tray = createTray();
  setupTrackerCallbacks();

  // 仅在开启时写入登录项：未打包环境下 macOS 会对 login item 写入报「Operation not permitted」
  if (ctx.store.settings.general.launchAtLogin) ctx.setLoginItem(true);
  ctx.tracker.start();

  screen.on('display-added', ensureFloatVisible);
  screen.on('display-removed', ensureFloatVisible);
  screen.on('display-metrics-changed', ensureFloatVisible);

  app.on('before-quit', () => {
    ctx.quitting = true;
    ctx.store.flush();
  });
  app.on('window-all-closed', () => {
    if (!IS_MAC) app.quit();
  });
  app.on('activate', () => ctx.showMain());

  // macOS：辅助功能权限状态（本应用不强依赖，仅用于设置页提示）
  if (IS_MAC) {
    ctx.accessibilityTrusted = () => {
      try {
        return systemPreferences.isTrustedAccessibilityClient(false);
      } catch {
        return null;
      }
    };
    ipcMain.handle('platform:accessibility', () => ({
      trusted: ctx.accessibilityTrusted(),
      platform: process.platform
    }));
  } else {
    ipcMain.handle('platform:accessibility', () => ({ trusted: true, platform: process.platform }));
  }

  // 每分钟校正一次「活跃时长」相关的展示，并刷新托盘文案
  setInterval(() => {
    if (ctx.rebuildTray) ctx.rebuildTray();
  }, 60_000).unref?.();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => ctx.showMain && ctx.showMain());
  app.whenReady().then(() => {
    if (IS_WIN && process.platform === 'win32') app.setAppUserModelId('com.mousejourney.app');
    try {
      boot();
    } catch (err) {
      console.error('[boot] 启动失败', err);
    }
  });
}

module.exports = ctx;
