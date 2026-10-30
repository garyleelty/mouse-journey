'use strict';
/**
 * 主进程冒烟测试：stub 掉 electron，直接在 Node 里驱动真实模块。
 * 用法：node scripts/smoke-main.cjs
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-smoke-'));

/* ---------------- electron stub ---------------- */
const cursor = { x: 100, y: 100 };
const displays = [
  { id: 1, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1, internal: false },
  { id: 2, bounds: { x: 0, y: 0, width: 1728, height: 1117 }, size: { width: 1728, height: 1117 }, scaleFactor: 2, internal: true }
];
const electronStub = {
  app: {
    getPath: (k) => (k === 'userData' ? tmpData : os.tmpdir()),
    on: () => {}, whenReady: () => Promise.resolve(), quit: () => {},
    setLoginItemSettings: () => {}, getLoginItemSettings: () => ({ openAtLogin: false })
  },
  screen: {
    getCursorScreenPoint: () => ({ ...cursor }),
    getDisplayNearestPoint: (p) => displays.find((d) => p.x >= d.bounds.x && p.x < d.bounds.x + d.bounds.width) || displays[1],
    getAllDisplays: () => displays,
    getPrimaryDisplay: () => displays[1],
    on: () => {},
    removeListener: () => {}
  },
  powerMonitor: { on: () => {}, removeListener: () => {} },
  ipcMain: { handle: () => {}, on: () => {} },
  BrowserWindow: class {}, Tray: class {}, Menu: class {},
  nativeImage: { createFromPath: () => ({}) }, Notification: class {},
  systemPreferences: { getUserMedia: () => Promise.resolve(true) },
  globalShortcut: { register: () => {}, unregisterAll: () => {} },
  dialog: {}, shell: {}
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronStub;
  return origLoad.call(this, request, ...rest);
};

/* ---------------- 1. store ---------------- */
const Store = require(path.join(ROOT, 'src/main/store.js'));
const store = new Store();
store.updateSettings({ journey: { routeId: 'jinghu' } });
store.settings.sampling.intervalMs = 16;
const days = store.data.days || {};
console.log('store ok · userData =', path.basename(tmpData), '· route =', store.settings.journey.routeId);

/* ---------------- 2. tracker（模拟光标扫动） ---------------- */
const Tracker = require(path.join(ROOT, 'src/main/tracker.js'));
const tr = new Tracker(store);
tr.start();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ticks = 0;
const step = 12; // 每次 tick 移动 12px
(async () => {
  for (let i = 0; i < 40; i++) {
    cursor.x += step;
    cursor.y += (i % 7) - 3;
    tr._tick();
    ticks++;
    await sleep(130); // > TRACK_MIN_GAP_MS(120) 才会落轨迹点；< MOVE_GAP_MS(300) 仍算一次连续移动
  }
  tr.stop();
  const today = Object.keys(store.data.days)[0];
  const day = store.data.days[today];
  const trackPts = (day.track || []).length;
  console.log(`tracker ok · ${ticks} ticks · 今日 ${day.distanceCm.toFixed(1)} cm · ${day.moves} 次移动 · 轨迹 ${trackPts} 点`);
  if (day.distanceCm < 5) throw new Error('tracker 没有累加到距离');
  if (trackPts < 10) throw new Error('轨迹采样点太少: ' + trackPts);
  if (day.moves !== 1) throw new Error('连续移动计次异常: ' + day.moves);

  /* ---------------- 3. calibration ---------------- */
  const { cmPerPointFor, describeDisplay } = require(path.join(ROOT, 'src/main/calibration.js'));
  const d24 = { id: 1, size: { width: 1920, height: 1080 }, scaleFactor: 1, diagonalInch: 24, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const cmPt = cmPerPointFor(d24, { mode: 'diagonal', diagonalInch: 24, factor: 1 });
  const sweep = 1920 * cmPt;
  const info = describeDisplay(d24, { mode: 'diagonal', diagonalInch: 24, factor: 1 });
  console.log(`calibration ok · 24" 1080p: ${cmPt.toFixed(5)} cm/点 · 横扫 ${sweep.toFixed(1)} cm · ppi ${info.ppi}`);
  if (Math.abs(sweep - 53.1) > 0.5) throw new Error('24" 显示器横扫宽度异常: ' + sweep);
  // 手动模式应绕过对角线计算
  const manual = cmPerPointFor(d24, { mode: 'manual', manualCmPerPoint: 0.05, factor: 1 });
  if (Math.abs(manual - 0.05) > 1e-9) throw new Error('手动 cm/点模式未生效');

  /* ---------------- 4. achievements ---------------- */
  const { mountFor, MILESTONES, MOUNTS } = require(path.join(ROOT, 'src/main/achievements.js'));
  const total = day.distanceCm / 100 + 12000;
  const m = mountFor(total);
  console.log(`achievements ok · 累计 ${total.toFixed(0)} m → 坐骑「${m.name}」 · 里程碑 ${MILESTONES.length} 个 · 坐骑 ${MOUNTS.length} 档`);
  if (!m || !m.name) throw new Error('mountFor 返回为空');

  /* ---------------- 5. journey ---------------- */
  const { Journey } = require(path.join(ROOT, 'src/main/journey.js'));
  const j = new Journey(store);
  j.addMeters(640);
  const snap = j.snapshot();
  console.log(`journey ok · ${snap.name} ${snap.progressKm}/${snap.totalKm} km · 景点 ${snap.spots.length} · 下一站 ${snap.nextCity ? snap.nextCity.name : '—'}`);
  if (snap.progressKm !== 640) throw new Error('journey 进度异常');

  /* ---------------- 5.5 趣味机制（冲刺/压弯/幽灵车/计数器） ---------------- */
  j.chargeEnergy(true, 45_000, 0); // 持续移动 45s → 能量满
  const whipR = j.whip();
  if (!whipR.ok) throw new Error('满能量冲刺失败');
  if (Math.abs(j.multiplier() - 2) > 1e-9) throw new Error('冲刺倍率未生效: ' + j.multiplier());
  j.addMeters(100); // 冲刺中 1m = 2km
  if (Math.abs(j.snapshot().progressKm - 840) > 0.01) throw new Error('冲刺里程翻倍异常: ' + j.snapshot().progressKm);
  j.boost.whipUntil -= 16_000; // 模拟冲刺结束
  j.setLean(true);
  if (Math.abs(j.multiplier() - 1.25) > 1e-9) throw new Error('压弯倍率未生效: ' + j.multiplier());
  j.addMeters(100);
  if (Math.abs(j.snapshot().progressKm - 965) > 0.01) throw new Error('压弯加成异常: ' + j.snapshot().progressKm);
  j.setLean(false);
  if (Math.abs(j.multiplier() - 1) > 1e-9) throw new Error('倍率未回落: ' + j.multiplier());
  const c = store.data.counters;
  if (c.whips !== 1 || c.leans !== 1 || c.whipDay.n !== 1) throw new Error('计数器异常: ' + JSON.stringify(c));
  store.recordIntraday();
  const gNone = store.ghostMetersAt();
  if (gNone !== null) throw new Error('无昨日数据时幽灵应为 null');
  const yKey = (() => { const d = new Date(Date.now() - 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const minNow = new Date().getHours() * 60 + new Date().getMinutes();
  store.data.days[yKey] = { distanceCm: 0, moves: 0, activeMs: 0, intraday: [] };
  store.data.days[yKey].intraday[minNow] = 123_456; // 昨天此刻 1234.56 m
  const g = store.ghostMetersAt();
  if (!g || Math.abs(g.meters - 1234.56) > 0.01) throw new Error('幽灵进度读取异常: ' + JSON.stringify(g));
  j.recordGhostPass();
  const ach = new (require(path.join(ROOT, 'src/main/achievements.js')).Achievements)(store);
  const unlockedNow = ach.check().map((a) => a.id);
  if (!unlockedNow.includes('w_1')) throw new Error('「第一次抽鞭」成就未解锁');
  console.log(`boost ok · 冲刺 ×2 / 压弯 ×1.25 / 计数 whips=${c.whips} leans=${c.leans} ghosts=${c.ghostPasses} · 昨日此刻 ${g.meters} m · 新成就 ${unlockedNow.join(',')}`);

  /* ---------------- 6. ipc 快照（buildState：渲染层拿到的全量状态） ---------------- */
  const { Achievements } = require(path.join(ROOT, 'src/main/achievements.js'));
  const { buildState } = require(path.join(ROOT, 'src/main/ipc.js'));
  const ctx = {
    store,
    journey: j,
    tracker: tr,
    health: { continuousMs: 31 * 60000 },
    achievements: new Achievements(store),
    screenLayout: () => ({ originX: 0, originY: 0, width: 1728, height: 1117, displays: [] })
  };
  const snap2 = buildState(ctx, true);
  const geoOk = snap2.geo && snap2.geo.rings.length === 3 && Array.isArray(snap2.geo.context) && snap2.geo.context.length >= 5 && snap2.geo.bbox;
  console.log(`ipc snapshot ok · 中国轮廓 ${snap2.geo.rings.length} · 周边陆地 ${snap2.geo.context.length} · 取景框 ${snap2.geo.bbox.minLon}~${snap2.geo.bbox.maxLon}°E`);
  console.log(`  存档 ${snap2.storeBytes} B · 数据目录 ${path.basename(snap2.dataDir)} · 需校准 ${snap2.needsCalibration} · 成就 ${snap2.achievements.length} 个`);
  if (!geoOk) throw new Error('geo 快照缺少 context/bbox');
  if (!snap2.dataDir || !(snap2.storeBytes > 0)) throw new Error('存储信息快照缺失');
  if (snap2.achievements.length !== MILESTONES.length) throw new Error('成就快照数量不符');

  /* ---------------- 7. 存档往返 ---------------- */
  store.flush();
  const Store2 = require(path.join(ROOT, 'src/main/store.js'));
  const s2 = new Store2();
  const ok = s2.settings.journey.routeId === 'jinghu' && Object.keys(s2.data.days).length > 0;
  console.log('persistence ok · 重载后 route =', s2.settings.journey.routeId, '· 天数 =', Object.keys(s2.data.days).length);
  if (!ok) throw new Error('存档往返失败');
  fs.rmSync(tmpData, { recursive: true, force: true });
  console.log('\nALL SMOKE TESTS PASSED');
})().catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); });
