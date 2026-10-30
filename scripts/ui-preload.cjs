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

/* 途经景点 5 个：2 已抵达 / 1 下一站（0.2km 后）/ 2 未到；坐标沿真实路线取点 */
const SPOT_DEFS = [
  { id: 's1', name: '殷墟', city: '安阳', atKm: Number((cum[1] + 60).toFixed(1)), intro: '甲骨文出土地，三千年前的都城遗址。', visited: true },
  { id: 's2', name: '龙门石窟', city: '洛阳', atKm: Number((cum[2] - 80).toFixed(1)), intro: '伊水两岸的北魏至唐造像艺术宝库。', visited: true },
  { id: 's3', name: '秦始皇兵马俑', city: '西安', atKm: spotKm, intro: '世界第八大奇迹，两千两百年前的地下军团。', visited: false },
  { id: 's4', name: '古汉台', city: '汉中', atKm: Number((cum[4] - 40).toFixed(1)), intro: '刘邦受封汉王时的宫廷遗迹。', visited: false },
  { id: 's5', name: '剑门关', city: '广元', atKm: Number((cum[5] + 55).toFixed(1)), intro: '「一夫当关，万夫莫开」的蜀道天险。', visited: false }
];
const SPOTS = SPOT_DEFS.map((d) => {
  const p = Geo.pointAtKm(points, cum, Math.min(totalKm, d.atKm));
  return { id: d.id, name: d.name, city: d.city, lon: p.lon, lat: p.lat, atKm: d.atKm, intro: d.intro };
});
const NEXT_SPOT = SPOTS.find((s) => s.id === 's3');

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
for (let i = 1; i <= 45; i++) { // 45 天：覆盖本月/上月同期与前 14 天同比
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

/* 热力卡假数据：双屏排布 + 聚类轨迹点（主屏 72%）+ 分钟级累计曲线（10–11 时高峰 34%） */
const SCREEN_LAYOUT = {
  originX: 0, originY: 0, width: 2880, height: 1117,
  displays: [
    { id: 1, x: 0, y: 0, w: 1728, h: 1117, primary: true, internal: true },
    { id: 2, x: 1728, y: 0, w: 1152, h: 1117, primary: false, internal: false }
  ]
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const jit = (i, amp) => (Math.sin(i * 12.9898) * 43758.5453 % 1) * amp; // 确定性抖动
const TRACK = [];
for (let i = 0; i < 400; i++) {
  if (i % 10 < 7) {
    // 主屏：两个热点簇（编辑器区 / 浏览器区）
    const c = i % 2 === 0 ? { x: 620, y: 420 } : { x: 980, y: 760 };
    TRACK.push({ x: clamp(c.x + jit(i, 260), 20, 1700), y: clamp(c.y + jit(i + 7, 220), 20, 1090), w: 1728, h: 1117, d: 1 });
  } else {
    TRACK.push({ x: clamp(2140 + jit(i + 3, 620), 1748, 2860), y: clamp(430 + jit(i + 11, 480), 20, 1090), w: 1152, h: 1117, d: 2 });
  }
}
const INTRADAY = (() => {
  const arr = [];
  const hourW = { 8: 0.06, 9: 0.16, 10: 0.34, 11: 0.14, 13: 0.1, 14: 0.12, 16: 0.08 };
  let acc = 0;
  for (let m = 0; m < 1440; m++) {
    const w = hourW[Math.floor(m / 60)] || 0;
    acc += (todayMeters * 100 * w) / 60 * (0.6 + 0.8 * Math.abs(Math.sin(m * 1.7)));
    if (w > 0) arr[m] = Math.round(acc);
  }
  arr[1439] = Math.round(todayMeters * 100);
  return arr;
})();

// 里程碑与 totals 自洽：下一档 300 km，进度 = 284.5/300 ≈ 94.8%（near 态）；MJ_MILESTONE 可覆盖
const ms = process.env.MJ_MILESTONE != null
  ? Math.max(0, Math.min(1, Number(process.env.MJ_MILESTONE)))
  : Math.min(1, 284500 / 300000);

const state = {
  today: { meters: todayMeters, moves: 214, activeMs: 4520000 },
  totals: { meters: 284500, moves: 9021, activeMs: 51230000 },
  paused: false,
  continuousMs: 754000,
  daysTotal: 34,
  metrics: { streakDays: 7, bestDayMeters: 6210 },
  track: TRACK,
  screenLayout: SCREEN_LAYOUT,
  todayIntraday: INTRADAY,
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
    id: 'train', name: '高铁', progress: 0.28, // 与 totals/mounts 自洽：284.5 km 在高铁(200km)~飞机(500km)之间
    next: { id: 'plane', name: '飞机', minMeters: 500000 }
  },
  // 里程成就 5 档（progress 由 totals 推导，300km 档受 MJ_MILESTONE 覆盖）：进行中 3 档可演示降序
  achievements: [
    ...[50000, 100000, 300000, 500000, 1000000].map((v) => {
      const progress = v === 300000 ? ms : Math.min(1, 284500 / v);
      const name = v >= 1000 ? `${v / 1000} km` : `${v} m`;
      return { type: 'distance', name, desc: `累计骑行 ${name}`, value: v, unlocked: progress >= 1, progress };
    }),
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
    nextSpot: NEXT_SPOT,
    spots: SPOTS,
    visitedSpots: SPOT_DEFS.filter((d) => d.visited).map((d) => d.id),
    boost: {
      energy, whipRemainS,
      whipLabel: '提速率',
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
    float: { opacity: 0.96, alwaysOnTopLevel: 'floating', visible: true, showRoute: true, collapsed: process.env.MJ_COLLAPSED === '1' },
    general: { launchAtLogin: false, closeToTray: true },
    goal: { enabled: true, dailyKm: 4 }, // 3842.6 m → 96% 环；4km 口径让 14 天达成日历虚实混合
    journey: { kmPerMeter: 2.5, mode: 'random', routeId: 'shot' }
  }
};

const ok = (v) => () => Promise.resolve(v);
const cbs = {};
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
  whip: ok({ ok: true, seconds: 15, label: '提速率' }),
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
  on: (ch, cb) => { (cbs[ch] = cbs[ch] || []).push(cb); return () => {}; }
});

/* MJ_EVENT=achv（默认）/ spot / city / complete / none：900ms 后注入一条庆祝事件，供截图自查 */
const fire = (ch, payload) => (cbs[ch] || []).forEach((f) => f(payload));
setTimeout(() => {
  const ev = process.env.MJ_EVENT || 'achv';
  if (ev === 'none') {
    // 不注入事件（截静态页面用）
  } else if (ev === 'mount') {
    // 坐骑升级瞬间：高铁 → 飞机（含 minMeters 供升级判定；冲刺文案同步新坐骑）
    fire('state:update', Object.assign({}, state, {
      mount: { id: 'plane', name: '飞机', minMeters: 500000, progress: 0, next: null },
      journey: Object.assign({}, state.journey, {
        boost: Object.assign({}, state.journey.boost, { whipLabel: '加力燃烧' })
      })
    }));
  } else if (ev === 'goal') {
    // 今日目标达成瞬间：真实跨越 6 km 目标（3.84 → 6.05 km）
    fire('state:update', Object.assign({}, state, { today: { meters: 6050, moves: 300, activeMs: 5600000 } }));
  } else if (ev === 'ghost') {
    // 超越瞬间：先推一条幽灵落后 120m 的 state:update（contextBridge 克隆对象，
    // 直接改 state 不影响渲染层已持有的拷贝），再注入超越事件
    fire('state:update', Object.assign({}, state, { ghost: { have: true, meters: todayMeters - 120 } }));
    fire('boost:event', { type: 'ghostPass', total: 3 });
  } else if (ev === 'spot') {
    fire('journey:event', { type: 'spot', payload: { name: '秦始皇兵马俑', city: '西安', intro: '世界第八大奇迹，两千两百年前的地下军团。' } });
  } else if (ev === 'city') {
    fire('journey:event', { type: 'city', payload: { name: '西安', km: 1057.8 } });
  } else if (ev === 'complete') {
    fire('journey:event', { type: 'complete', payload: { routeName: '京→蓉 纵贯线', totalKm: 1681.9 } });
  } else {
    fire('achievement', { name: '50 km', desc: '累计骑行 50 公里' });
  }
}, 900);
