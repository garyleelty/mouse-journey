'use strict';
/**
 * UI 截图 harness 的 stub preload：给渲染层一个完整假 state，不碰主进程与真实存档。
 * 可用环境变量微调玩法叠层状态：
 *   MJ_ENERGY  能量槽 0..1（默认 0.72）
 *   MJ_WHIP    冲刺剩余秒数（默认 0 = 未冲刺）
 *   MJ_LEAN    1 = 压弯中
 *   MJ_GHOST   0 = 无幽灵车（默认 1 = 幽灵领先 4 km）
 */
const { contextBridge } = require('electron');
const Geo = require('../src/shared/geo.js');

/* ---- 合成路线：北京 → 石家庄 → 郑州 → 西安 → 汉中 → 广元 → 成都 ---- */
const CITY = [
  { name: '北京', lon: 116.4, lat: 39.9 },
  { name: '石家庄', lon: 114.5, lat: 38.0 },
  { name: '郑州', lon: 113.6, lat: 34.7 },
  { name: '西安', lon: 108.9, lat: 34.3 },
  { name: '汉中', lon: 107.0, lat: 33.1 },
  { name: '广元', lon: 105.8, lat: 32.4 },
  { name: '成都', lon: 104.1, lat: 30.7 }
];
const points = CITY.map((c) => ({ name: c.name, lon: c.lon, lat: c.lat }));
const cum = Geo.cumulativeKm(points);
const totalKm = cum[cum.length - 1];

// 当前位置：距西安 18.5 km（路上画面能看到城市与景点牌）
const XIAN = 3;
const progressKm = Number((cum[XIAN] - 18.5).toFixed(2));
const here = Geo.pointAtKm(points, cum, progressKm);
const spotKm = Number((progressKm + 0.21).toFixed(2)); // 景点牌在 210m 前方

const todayMeters = 3842.6;
const energy = Math.max(0, Math.min(1, Number(process.env.MJ_ENERGY || 0.72)));
const whipRemainS = Number(process.env.MJ_WHIP || 0);
const leanActive = process.env.MJ_LEAN === '1';
const ghostAheadKm = process.env.MJ_GHOST === '0' ? null : 4;

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const rawDays = {};
for (let i = 1; i <= 6; i++) {
  rawDays[dayKey(Date.now() - i * 86400000)] = {
    distanceCm: 320000 + Math.round(Math.sin(i * 2.1) * 180000) + i * 9000,
    moves: 140 + i * 23,
    activeMs: 2400000 + i * 320000
  };
}
rawDays[dayKey(Date.now())] = { distanceCm: Math.round(todayMeters * 100), moves: 214, activeMs: 4520000 };

/* 极简中国轮廓（示意级，仅 harness 用） */
const RINGS = [[[121.5, 53.5], [135, 48], [127.5, 41], [124.3, 39.8], [121.5, 38.5], [122, 36], [119.2, 34.5], [121.8, 31], [121, 28], [115, 23], [110, 20.5], [108, 21.4], [102, 24.8], [97.5, 28], [91, 27.8], [85, 28.2], [80.3, 30], [76, 35.5], [73.8, 39.5], [87.5, 49], [96, 43], [110, 42.5], [117, 46.5], [121.5, 53.5]]];
const CONTEXT = RINGS[0].map(([lon, lat]) => [lon + (lon > 104 ? 1.6 : -1.6), lat + (lat > 36 ? 1.4 : -1.2)]);

const state = {
  today: { meters: todayMeters, moves: 214, activeMs: 4520000 },
  totals: { meters: 284500, moves: 9021, activeMs: 51230000 },
  paused: false,
  continuousMs: 754000,
  daysTotal: 34,
  metrics: { streakDays: 7, bestDayMeters: 6210 },
  track: [],
  screenLayout: null,
  displays: [],
  dataDir: '/tmp/mj-shot',
  storeBytes: 48211,
  calibratedAt: Date.now() - 86400000 * 3,
  needsCalibration: false,
  ghost: { have: ghostAheadKm != null, meters: todayMeters + (ghostAheadKm || 0) * 1000 },
  rawDays,
  routes: [{ id: 'shot', name: '京→蓉 纵贯线' }],
  mounts: [
    { id: 'walk', name: '步行', minMeters: 0 },
    { id: 'bike', name: '自行车', minMeters: 1000 },
    { id: 'bus', name: '公交', minMeters: 10000 },
    { id: 'car', name: '汽车', minMeters: 50000 },
    { id: 'train', name: '高铁', minMeters: 200000 },
    { id: 'plane', name: '飞机', minMeters: 500000 }
  ],
  mount: {
    id: 'car', name: '汽车', progress: 0.36,
    next: { id: 'train', name: '高铁', minMeters: 200000 }
  },
  achievements: [
    { type: 'distance', name: '50 km', desc: '累计骑行 50 公里', value: 50000, unlocked: true, progress: 1 },
    { type: 'distance', name: '100 km', desc: '累计骑行 100 公里', value: 100000, unlocked: false, progress: 0.68 },
    { type: 'whip', name: '第一次抽鞭', desc: '完成一次冲刺', value: 1, unlocked: true, progress: 1 }
  ],
  journeyLog: [],
  journey: {
    routeId: 'shot',
    name: '京→蓉 纵贯线',
    desc: '从华北平原翻越秦岭进入四川盆地，全程 1860 公里。',
    points, cum, totalKm,
    progressKm,
    percent: progressKm / totalKm,
    remainKm: Number((totalKm - progressKm).toFixed(1)),
    heading: here.heading,
    cityIndex: XIAN - 1,
    nextCity: CITY[XIAN],
    nextSpot: { id: 's1', name: '秦始皇兵马俑', city: '西安', lon: 109.25, lat: 34.38, atKm: spotKm, intro: '世界第八大奇迹，两千两百年前的地下军团。' },
    spots: [{ id: 's1', name: '秦始皇兵马俑', city: '西安', lon: 109.25, lat: 34.38, atKm: spotKm, intro: '世界第八大奇迹，两千两百年前的地下军团。' }],
    visitedSpots: [],
    boost: {
      energy, whipRemainS,
      whipLabel: '地板油',
      leanActive,
      gameMult: (whipRemainS > 0 ? 2 : 1) * (leanActive ? 1.25 : 1),
      multiplier: 2.5
    }
  },
  geo: {
    bbox: { minLon: 103, maxLon: 117.5, minLat: 29.5, maxLat: 41 },
    rings: RINGS,
    context: [CONTEXT]
  },
  settings: {
    calibration: { mode: 'diagonal', diagonalInch: 14, manualCmPerPoint: 0, factor: 1, perDisplay: {} },
    sampling: { intervalMs: 33, deadZonePx: 2, maxJumpRatio: 0.6, crossScreenSkip: false },
    health: { enabled: true, thresholdMin: 45, snoozeMin: 10, idleResetSec: 60, title: '该休息啦', message: '已连续使用 {min} 分钟，起身活动一下吧。', useNotification: false },
    float: { opacity: 0.96, alwaysOnTopLevel: 'floating', visible: true, showRoute: true, collapsed: false },
    general: { launchAtLogin: false, closeToTray: true },
    journey: { kmPerMeter: 2.5, mode: 'random', routeId: 'shot' }
  }
};

const ok = (v) => () => Promise.resolve(v);
contextBridge.exposeInMainWorld('api', {
  getState: ok(state),
  statsRange: ok([]),
  displays: ok([]),
  calibrationPreview: ok({}),
  calibrationDone: ok(state),
  exportData: ok({ ok: true, path: '/tmp' }),
  accessibility: ok({ platform: 'darwin', trusted: true }),
  updateSettings: ok(state),
  setJourneyMode: ok(state),
  reroll: ok(state),
  whip: ok({ ok: true, seconds: 15, label: '地板油' }),
  setLean: ok({}),
  ghostPass: ok({ total: 3 }),
  snooze: ok({}),
  rest: ok({}),
  testReminder: ok({}),
  reminderAck: ok({}),
  setOpacity: ok({}),
  setCollapsed: ok({}),
  hideFloat: ok({}),
  pause: ok(state),
  showMain: ok({}),
  openUrl: ok({}),
  resetDay: ok(state),
  openFolder: ok({}),
  quit: ok({}),
  on: () => () => {}
});
