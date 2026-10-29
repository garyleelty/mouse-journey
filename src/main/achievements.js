'use strict';

/** 里程里程碑（累计真实物理距离，单位：米） */
const MILESTONES = [
  { id: 'm_100',    type: 'distance', value: 100,    icon: '🌱', name: '初出茅庐',     desc: '累计移动 100 米' },
  { id: 'm_500',    type: 'distance', value: 500,    icon: '🍃', name: '渐入佳境',     desc: '累计移动 500 米' },
  { id: 'm_1k',     type: 'distance', value: 1000,   icon: '🏅', name: '一公里俱乐部', desc: '累计移动 1 公里' },
  { id: 'm_5k',     type: 'distance', value: 5000,   icon: '🌉', name: '穿城而过',     desc: '累计移动 5 公里' },
  { id: 'm_10k',    type: 'distance', value: 10000,  icon: '🎖️', name: '十里长亭',     desc: '累计移动 10 公里' },
  { id: 'm_42k',    type: 'distance', value: 42195,  icon: '🏃', name: '马拉松完赛',   desc: '累计移动 42.195 公里' },
  { id: 'm_100k',   type: 'distance', value: 100000, icon: '🧭', name: '百里行者',     desc: '累计移动 100 公里' },
  { id: 'h_10',     type: 'active',   value: 10,     icon: '⏳', name: '专注十小时',   desc: '累计活跃时长 10 小时' },
  { id: 'd_1k',     type: 'bestDay',  value: 1000,   icon: '☀️', name: '单日破千',     desc: '单日移动超过 1 公里' },
  { id: 's_3',      type: 'streak',   value: 3,      icon: '🔥', name: '三日之约',     desc: '连续 3 天有移动记录' }
];

/** 坐骑分级：按累计里程演进，speed 只影响悬浮窗小人的动画步频/速度感 */
const MOUNTS = [
  { id: 'walk',  minMeters: 0,       icon: '🚶', name: '步行',   speed: 1.0, desc: '一步一个脚印，慢慢来比较快。' },
  { id: 'bike',  minMeters: 1000,    icon: '🚲', name: '自行车', speed: 1.6, desc: '踩上单车，城市开始后退。' },
  { id: 'bus',   minMeters: 10000,   icon: '🚌', name: '公交车', speed: 2.4, desc: '2 元一张票，坐遍全城。' },
  { id: 'car',   minMeters: 100000,  icon: '🚗', name: '汽车',   speed: 3.2, desc: '油门一踩，省界就在眼前。' },
  { id: 'train', minMeters: 500000,  icon: '🚄', name: '高铁',   speed: 4.5, desc: '350 km/h，山河一闪而过。' },
  { id: 'plane', minMeters: 2000000, icon: '✈️', name: '飞机',   speed: 6.0, desc: '一万米高空，云在脚下。' }
];

function mountFor(meters) {
  let cur = MOUNTS[0];
  for (const m of MOUNTS) if (meters >= m.minMeters) cur = m;
  const next = MOUNTS[MOUNTS.indexOf(cur) + 1] || null;
  return {
    ...cur,
    next,
    progress: next ? (meters - cur.minMeters) / (next.minMeters - cur.minMeters) : 1
  };
}

class Achievements {
  constructor(store) {
    this.store = store;
  }

  /** 计算派生指标（连续天数、单日最佳、活跃小时） */
  metrics() {
    const days = this.store.data.days || {};
    const keys = Object.keys(days).sort();
    let streak = 0;
    if (keys.length) {
      // 从今天（或昨天）往前数连续有记录的天数
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      let cursor = new Date();
      if (!days[todayKey]) cursor = new Date(Date.now() - 86400000);
      for (let i = 0; i < 3650; i++) {
        const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        if ((days[k]?.distanceCm || 0) > 0) {
          streak++;
          cursor = new Date(cursor.getTime() - 86400000);
        } else break;
      }
    }
    let bestDayMeters = 0;
    for (const k of keys) bestDayMeters = Math.max(bestDayMeters, (days[k].distanceCm || 0) / 100);
    return {
      streakDays: streak,
      bestDayMeters,
      activeHours: (this.store.data.totals.activeMs || 0) / 3600000,
      totalMeters: (this.store.data.totals.distanceCm || 0) / 100
    };
  }

  /** 检查并返回本次新解锁的成就 */
  check() {
    const m = this.metrics();
    const unlocked = this.store.data.achievements || {};
    const fresh = [];
    for (const a of MILESTONES) {
      if (unlocked[a.id]) continue;
      const v =
        a.type === 'distance' ? m.totalMeters :
        a.type === 'active' ? m.activeHours :
        a.type === 'bestDay' ? m.bestDayMeters :
        a.type === 'streak' ? m.streakDays : 0;
      if (v >= a.value) {
        unlocked[a.id] = new Date().toISOString();
        fresh.push(a);
      }
    }
    if (fresh.length) this.store.saveSoon();
    return fresh;
  }

  /** 已解锁列表（含进度） */
  list() {
    const m = this.metrics();
    const unlocked = this.store.data.achievements || {};
    return MILESTONES.map((a) => {
      const v =
        a.type === 'distance' ? m.totalMeters :
        a.type === 'active' ? m.activeHours :
        a.type === 'bestDay' ? m.bestDayMeters :
        a.type === 'streak' ? m.streakDays : 0;
      return { ...a, unlocked: !!unlocked[a.id], at: unlocked[a.id] || null, progress: Math.min(1, v / a.value), current: v };
    });
  }
}

module.exports = { Achievements, MILESTONES, MOUNTS, mountFor };
