'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ipcMain, app } = require('electron');
const { dayKey, lastNDays, weekdayLabel } = require('../shared/format');
const { mountFor, MOUNTS } = require('./achievements');
const { listDisplays } = require('./calibration');
const { FIXED_ROUTES } = require('./data/routes');
const { CHINA_RINGS, NEIGHBOR_RINGS, REGION_BBOX } = require('./data/china-geo');

function series(store, keys) {
  const days = store.data.days || {};
  return keys.map((k) => {
    const d = days[k] || { distanceCm: 0, moves: 0, activeMs: 0 };
    return { key: k, meters: Number(((d.distanceCm || 0) / 100).toFixed(3)), moves: d.moves || 0, activeMs: d.activeMs || 0 };
  });
}

/** 组装推送给渲染层的状态快照 */
function buildState(ctx, full) {
  const today = ctx.store.today();
  const totals = ctx.store.data.totals;
  const state = {
    now: Date.now(),
    today: {
      key: dayKey(),
      meters: Number(((today.distanceCm || 0) / 100).toFixed(3)),
      moves: today.moves || 0,
      activeMs: today.activeMs || 0
    },
    totals: {
      meters: Number(((totals.distanceCm || 0) / 100).toFixed(3)),
      moves: totals.moves || 0,
      activeMs: totals.activeMs || 0
    },
    journey: ctx.journey.snapshot(),
    mount: mountFor((totals.distanceCm || 0) / 100),
    paused: !!ctx.tracker.paused,
    continuousMs: ctx.health.continuousMs
  };
  if (full) {
    state.settings = ctx.store.settings;
    state.achievements = ctx.achievements.list();
    state.metrics = ctx.achievements.metrics();
    state.displays = listDisplays(ctx.store.settings.calibration);
    state.routes = FIXED_ROUTES.map((r) => ({ id: r.id, name: r.name, desc: r.desc, waypoints: r.waypoints }));
    state.journeyLog = (ctx.store.data.journeyLog || []).slice().reverse();
    state.geo = { rings: CHINA_RINGS, context: NEIGHBOR_RINGS, bbox: REGION_BBOX };
    state.mounts = MOUNTS;
    // 最近 400 天的汇总（供统计页任意区间切片，不含轨迹点）
    const allKeys = Object.keys(ctx.store.data.days || {}).sort();
    state.daysTotal = allKeys.length;
    state.rawDays = allKeys.slice(-400).reduce((acc, k) => {
      const d = ctx.store.data.days[k];
      acc[k] = { distanceCm: d.distanceCm || 0, moves: d.moves || 0, activeMs: d.activeMs || 0 };
      return acc;
    }, {});
    // 首次运行引导：尚未手动校准过则提示
    state.needsCalibration = !ctx.store.data.calibratedAt;
    state.calibratedAt = ctx.store.data.calibratedAt || null;
    // 存储信息（设置页「通用」卡片展示）
    state.dataDir = app.getPath('userData');
    try {
      state.storeBytes = fs.statSync(path.join(app.getPath('userData'), ctx.store.fileName)).size;
    } catch {
      state.storeBytes = 0;
    }
  }
  // 当日轨迹（只带今日，历史轨迹不推送）
  const todayRec = ctx.store.today();
  state.track = (todayRec.track || []).slice(-3000);
  state.screenLayout = ctx.screenLayout ? ctx.screenLayout() : null;
  // 趣味机制：水平速度（压弯判定用）与幽灵车（昨天此刻的当日累计距离）
  state.vx = ctx.tracker ? (ctx.tracker.vx || 0) : 0;
  const g = ctx.store.ghostMetersAt();
  state.ghost = { have: !!g, meters: g ? Number(g.meters.toFixed(1)) : 0 };
  return state;
}

function registerIpc(ctx) {
  const { store, tracker, journey, achievements, health } = ctx;

  const pushFull = () => {
    const payload = buildState(ctx, true);
    ctx.broadcast('state:full', payload);
    return payload;
  };

  ipcMain.handle('state:get', () => buildState(ctx, true));

  ipcMain.handle('settings:update', (_e, patch) => {
    const before = JSON.parse(JSON.stringify(store.settings));
    store.updateSettings(patch || {});
    const s = store.settings;
    // 采样频率变化 → 重建定时器
    if (s.sampling.intervalMs !== before.sampling.intervalMs) tracker.refreshInterval();
    // 悬浮窗属性
    if (ctx.applyFloatSettings) ctx.applyFloatSettings(before, s);
    if (s.general.launchAtLogin !== before.general.launchAtLogin) {
      ctx.setLoginItem(s.general.launchAtLogin);
    }
    if (s.journey.mode !== before.journey.mode || (s.journey.mode === 'fixed' && s.journey.routeId !== before.journey.routeId)) {
      journey.setMode(s.journey.mode, s.journey.routeId);
    }
    store.flush();
    return pushFull();
  });

  ipcMain.handle('journey:setMode', (_e, args) => {
    const { mode, routeId } = args || {};
    store.updateSettings({ journey: { mode: mode || 'random', routeId: routeId || store.settings.journey.routeId } });
    journey.setMode(store.settings.journey.mode, store.settings.journey.routeId);
    return pushFull();
  });

  ipcMain.handle('journey:reroll', () => {
    journey.reroll();
    return pushFull();
  });

  ipcMain.handle('stats:range', (_e, args) => {
    const days = Math.max(1, Math.min(365, (args && args.days) || 7));
    return series(store, lastNDays(days));
  });

  ipcMain.handle('displays:list', () => listDisplays(store.settings.calibration));

  ipcMain.handle('calibration:preview', (_e, args) => {
    const { describeDisplay } = require('./calibration');
    const { screen } = require('electron');
    const list = screen.getAllDisplays();
    const d = list.find((x) => String(x.id) === String(args && args.id)) || list[0];
    const cal = { ...store.settings.calibration, ...(args || {}) };
    return describeDisplay(d, cal);
  });

  /** 完成首次校准引导 */
  ipcMain.handle('calibration:done', () => {
    if (!store.data.calibratedAt) {
      store.data.calibratedAt = Date.now();
      store.saveSoon();
    }
    return pushFull();
  });

  /** 导出数据为 CSV 或 JSON */
  ipcMain.handle('data:export', async (_e, args) => {
    const { dialog } = require('electron');
    const format = (args && args.format) || 'csv';
    const isCsv = format === 'csv';
    const ext = isCsv ? 'csv' : 'json';
    const res = await dialog.showSaveDialog({
      title: '导出 MouseJourney 数据',
      defaultPath: `mouse-journey-${dayKey()}.${ext}`,
      filters: isCsv
        ? [{ name: 'CSV 表格', extensions: ['csv'] }]
        : [{ name: 'JSON 数据', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };

    const days = store.data.days || {};
    const keys = Object.keys(days).sort();
    let content;
    if (isCsv) {
      const head = '日期,星期,距离(米),移动次数,活跃时长(分钟),轨迹点数\n';
      const rows = keys.map((k) => {
        const d = days[k];
        return [k, weekdayLabel(k), (d.distanceCm / 100).toFixed(3), d.moves || 0, ((d.activeMs / 60000).toFixed(2)), (d.track || []).length].join(',');
      });
      // BOM，保证 Excel 打开中文不乱码
      content = '\uFEFF' + head + rows.join('\n') + '\n';
    } else {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: store.data.version,
        settings: store.data.settings,
        totals: store.data.totals,
        days: keys.reduce((acc, k) => {
          acc[k] = { ...days[k], track: undefined };
          return acc;
        }, {}),
        journey: ctx.journey.snapshot(),
        achievements: store.data.achievements || {},
        journeyLog: store.data.journeyLog || []
      };
      content = JSON.stringify(payload, null, 2);
    }
    const fs = require('node:fs');
    fs.writeFileSync(res.filePath, content, 'utf8');
    return { ok: true, path: res.filePath };
  });

  ipcMain.handle('health:snooze', () => {
    health.snooze();
    return true;
  });
  ipcMain.handle('health:rest', () => {
    health.reset();
    return true;
  });
  ipcMain.handle('reminder:ack', (_e, action) => {
    if (action === 'snooze') health.snooze();
    else health.reset();
    if (ctx.reminder && !ctx.reminder.isDestroyed()) ctx.reminder.close();
    return true;
  });

  ipcMain.handle('health:test', () => {
    ctx.openReminder({ minutes: store.settings.health.thresholdMin, title: store.settings.health.title, message: store.settings.health.message.replace('{min}', String(store.settings.health.thresholdMin)) });
    return true;
  });

  ipcMain.handle('tracker:pause', (_e, paused) => {
    if (paused) tracker._pause('user');
    else tracker._resume('user');
    return !!tracker.paused;
  });

  ipcMain.handle('float:setOpacity', (_e, v) => {
    const val = Math.max(0.25, Math.min(1, Number(v) || 1));
    store.updateSettings({ float: { opacity: val } });
    if (ctx.float && !ctx.float.isDestroyed()) ctx.float.setOpacity(val);
    return val;
  });

  ipcMain.handle('float:setCollapsed', (_e, collapsed) => {
    store.updateSettings({ float: { collapsed: !!collapsed } });
    ctx.resizeFloat(!!collapsed);
    return !!collapsed;
  });

  ipcMain.handle('float:hide', () => {
    if (ctx.float && !ctx.float.isDestroyed()) ctx.float.hide();
    return true;
  });

  ipcMain.handle('window:showMain', () => {
    ctx.showMain();
    return true;
  });

  ipcMain.handle('window:openUrl', (_e, url) => {
    const { shell } = require('electron');
    // 只放行 http(s)，防止误传/恶意 scheme 被系统直接执行
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
    return true;
  });

  /* ---- 趣味机制：抽鞭冲刺 / 顺弯压弯 / 幽灵车 ---- */
  ipcMain.handle('boost:whip', () => ctx.journey.whip());
  ipcMain.handle('boost:lean', (_e, a) => {
    ctx.journey.setLean(!!(a && a.active));
    return true;
  });
  ipcMain.handle('boost:ghostPass', () => ctx.journey.recordGhostPass());

  ipcMain.handle('data:resetDay', () => {
    const k = dayKey();
    const cur = store.data.days[k];
    if (cur) {
      store.data.totals.distanceCm = Math.max(0, (store.data.totals.distanceCm || 0) - (cur.distanceCm || 0));
      store.data.totals.moves = Math.max(0, (store.data.totals.moves || 0) - (cur.moves || 0));
      store.data.totals.activeMs = Math.max(0, (store.data.totals.activeMs || 0) - (cur.activeMs || 0));
      store.data.days[k] = { distanceCm: 0, moves: 0, activeMs: 0, firstTs: Date.now(), lastTs: Date.now() };
    }
    journey.reroll();
    store.flush();
    return pushFull();
  });

  ipcMain.handle('app:quit', () => {
    ctx.quitting = true;
    app.quit();
    return true;
  });

  ipcMain.handle('data:openFolder', () => {
    const { shell, app } = require('electron');
    shell.openPath(app.getPath('userData'));
    return true;
  });

  return { pushFull, buildState: (full) => buildState(ctx, full) };
}

module.exports = { registerIpc, buildState, series };
