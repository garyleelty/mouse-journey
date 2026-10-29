'use strict';
/**
 * 生成 renderer 检查用的 mock 状态（供 taste-skill 的 inspect.mjs --app 测量 UI）。
 * 用法：node .taste-skill/gen-mock.cjs  →  .taste-skill/harness/mock-state.json
 * 数据全部由真实模块（Journey / MILESTONES / MOUNTS / CHINA_RINGS）计算，样本量级真实。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const { FIXED_ROUTES } = require(path.join(ROOT, 'src/main/data/routes.js'));
const { Journey } = require(path.join(ROOT, 'src/main/journey.js'));
const { MILESTONES, MOUNTS, mountFor } = require(path.join(ROOT, 'src/main/achievements.js'));
const { CHINA_RINGS, NEIGHBOR_RINGS, REGION_BBOX } = require(path.join(ROOT, 'src/main/data/china-geo.js'));

/* ---------------- 日期工具 ---------------- */
const keyOf = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const DAY = 86400000;

/* ---------------- 23 天历史（工作日高、周末低，量级真实） ---------------- */
const days = {};
const todayKey = keyOf(Date.now());
// 固定伪随机，保证多次生成一致
let seed = 42;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
for (let i = 22; i >= 0; i--) {
  const t = Date.now() - i * DAY;
  const k = keyOf(t);
  const dow = new Date(t).getDay();
  const weekend = dow === 0 || dow === 6;
  const base = weekend ? 90 + rnd() * 260 : 320 + rnd() * 640;
  const cm = Math.round(base * 100);
  days[k] = {
    distanceCm: cm,
    moves: Math.round(cm / 0.42),
    activeMs: Math.round((cm / 100) * 26 * 1000 * (0.8 + rnd() * 0.5)),
    firstTs: t + 9 * 3600000,
    lastTs: t + 18 * 3600000
  };
}
// 今天：进行中的一天
days[todayKey] = {
  distanceCm: 41260,
  moves: 1240,
  activeMs: 10080 * 1000, // 2h48m
  firstTs: Date.now() - 5.5 * 3600000,
  lastTs: Date.now() - 60000
};
// 连续 3 天有记录（成就 s_3 未解锁边界演示）：把 3 天前设为大值
const k3 = keyOf(Date.now() - 3 * DAY);
days[k3].distanceCm = Math.max(days[k3].distanceCm, 56000);

let totCm = 0, totMoves = 0, totActive = 0;
for (const k of Object.keys(days)) {
  totCm += days[k].distanceCm;
  totMoves += days[k].moves;
  totActive += days[k].activeMs;
}

/* ---------------- 显示器（双屏：左侧 1080p，右侧 MacBook 主屏） ---------------- */
function describeDisplay(id, w, h, scale, inch, x, primary) {
  const diagDip = Math.hypot(w, h);
  const cmPerPoint = (inch * 2.54) / diagDip;
  return {
    id,
    label: primary ? '主显示器' : `显示器 #${id}`,
    primary,
    bounds: { x, y: 0, width: w, height: h },
    sizeDip: { width: w, height: h },
    scaleFactor: scale,
    physicalPx: { width: Math.round(w * scale), height: Math.round(h * scale) },
    rotation: 0,
    internal: !!primary,
    diagonalInch: inch,
    diagonalCm: Number((inch * 2.54).toFixed(2)),
    widthCm: Number((w * cmPerPoint).toFixed(2)),
    heightCm: Number((h * cmPerPoint).toFixed(2)),
    ppi: Number(((diagDip * scale) / inch).toFixed(1)),
    cmPerPoint,
    sweepCm: Number((w * cmPerPoint).toFixed(1))
  };
}
const displays = [
  describeDisplay(1, 1920, 1080, 1, 24, -1920, false),  // 左侧 1080p 外接
  describeDisplay(2, 1728, 1117, 2, 14, 0, true)       // 右侧主屏（MacBook）
];

/* ---------------- 旅程（真实 Journey 计算：京沪固定线 + 640 km 进度） ---------------- */
const store = {
  data: { journeyLog: [] },
  settings: { journey: { mode: 'fixed', routeId: 'jinghu', kmPerMeter: 1, autoNext: true, showSpotCards: true } },
  saveSoon() {}
};
const j = new Journey(store);
j.addMeters(640); // 真实 640 m → 地图 640 km（kmPerMeter = 1）
const journey = j.snapshot();
store.data.journeyLog = [
  { name: '上海 → 兰州 · 随机旅程 #1', totalKm: 2610.3, finishedAt: Date.now() - 6 * DAY, spots: 5 },
  { name: '广州 → 成都 · 随机旅程 #2', totalKm: 1342.8, finishedAt: Date.now() - 13 * DAY, spots: 3 }
];

/* ---------------- 成就 / 坐骑 ---------------- */
const totalMeters = totCm / 100;
const activeHours = totActive / 3600000;
let bestDayMeters = 0;
for (const k of Object.keys(days)) bestDayMeters = Math.max(bestDayMeters, days[k].distanceCm / 100);
const streakDays = 3;
const metrics = { streakDays, bestDayMeters, activeHours, totalMeters };
const unlocked = {};
for (const a of MILESTONES) {
  const v =
    a.type === 'distance' ? totalMeters :
    a.type === 'active' ? activeHours :
    a.type === 'bestDay' ? bestDayMeters :
    a.type === 'streak' ? streakDays : 0;
  if (v >= a.value) unlocked[a.id] = new Date(Date.now() - (3 + Math.floor(rnd() * 10)) * DAY).toISOString();
}
const achievements = MILESTONES.map((a) => {
  const v =
    a.type === 'distance' ? totalMeters :
    a.type === 'active' ? activeHours :
    a.type === 'bestDay' ? bestDayMeters :
    a.type === 'streak' ? streakDays : 0;
  return { ...a, unlocked: !!unlocked[a.id], at: unlocked[a.id] || null, progress: Math.min(1, v / a.value), current: v };
});

/* ---------------- 当日轨迹（虚拟桌面坐标系：双屏并集 -3648×1117→ 右侧主屏 0..1728） ---------------- */
const layout = { originX: -1920, originY: 0, width: 3648, height: 1117,
  displays: [{ id: 1, x: -1920, y: 0, width: 1920, height: 1080 }, { id: 2, x: 0, y: 0, width: 1728, height: 1117 }] };
const track = [];
// 主屏：编辑器/浏览器区域两团 + 侧边导航一竖条；副屏：参考文档一区
const clusters = [
  { cx: 560, cy: 300, rx: 700, ry: 260, n: 240 },
  { cx: 1180, cy: 760, rx: 480, ry: 200, n: 160 },
  { cx: 60, cy: 500, rx: 60, ry: 380, n: 70 },
  { cx: -980, cy: 480, rx: 700, ry: 300, n: 110 }
];
for (const c of clusters) {
  for (let i = 0; i < c.n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    track.push({
      x: Math.round(c.cx + Math.cos(a) * c.rx * r),
      y: Math.round(c.cy + Math.sin(a) * c.ry * r),
      t: Date.now() - Math.round(rnd() * 5.5 * 3600000)
    });
  }
}

/* ---------------- settings（与 store 默认一致） ---------------- */
const settings = {
  sampling: { intervalMs: 80, deadZonePx: 2, maxJumpRatio: 1.2, crossScreenSkip: true },
  calibration: { mode: 'diagonal', diagonalInch: 24, perDisplay: { 2: 14 }, factor: 1.0, manualCmPerPoint: null },
  journey: { mode: 'fixed', routeId: 'jinghu', kmPerMeter: 1, autoNext: true, showSpotCards: true },
  health: {
    enabled: true, thresholdMin: 45, snoozeMin: 10, idleResetSec: 120, useNotification: true,
    title: '该起身活动一下啦', message: '你已经连续使用鼠标 {min} 分钟了。站起来走走，看看 6 米以外的地方 20 秒吧。'
  },
  float: { visible: true, collapsed: false, opacity: 0.96, alwaysOnTopLevel: 'floating', x: null, y: null, showRoute: true },
  general: { launchAtLogin: false, closeToTray: true }
};

const rawDays = {};
for (const k of Object.keys(days)) {
  rawDays[k] = { distanceCm: days[k].distanceCm, moves: days[k].moves, activeMs: days[k].activeMs };
}

const state = {
  now: Date.now(),
  today: { key: todayKey, meters: Number((days[todayKey].distanceCm / 100).toFixed(3)), moves: days[todayKey].moves, activeMs: days[todayKey].activeMs },
  totals: { meters: Number((totCm / 100).toFixed(3)), moves: totMoves, activeMs: totActive },
  journey,
  mount: mountFor(totalMeters),
  paused: false,
  continuousMs: 31 * 60000,
  settings,
  achievements,
  metrics,
  week: null,
  recent: null,
  displays,
  routes: FIXED_ROUTES.map((r) => ({ id: r.id, name: r.name, desc: r.desc, waypoints: r.waypoints })),
  journeyLog: store.data.journeyLog.slice().reverse(),
  geo: { rings: CHINA_RINGS, context: NEIGHBOR_RINGS, bbox: REGION_BBOX },
  dataDir: '/Users/tianyi/Library/Application Support/mouse-journey',
  storeBytes: 184320,
  mounts: MOUNTS,
  rawDays,
  needsCalibration: false,
  calibratedAt: Date.now() - 9 * DAY,
  track,
  screenLayout: layout
};

const out = path.join(__dirname, 'harness', 'mock-state.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(state));
console.log('mock-state.json 写入完成');
console.log('今日', state.today, '\n累计', state.totals.meters, 'm');
console.log('旅程', journey.name, journey.progressKm + '/' + journey.totalKm + 'km', '景点', journey.spots.length);
console.log('成就', achievements.filter((a) => a.unlocked).length + '/' + achievements.length, '坐骑', state.mount.name);
console.log('轨迹点', track.length, '天', Object.keys(days).length);
