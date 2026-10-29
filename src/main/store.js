'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { dayKey } = require('../shared/format');

const FILE_NAME = 'mouse-journey.json';
const VERSION = 1;

function defaults() {
  return {
    version: VERSION,
    settings: {
      sampling: {
        intervalMs: 80,     // 采样周期（ms），即 ~12.5Hz
        deadZonePx: 2,      // 小于该位移视为抖动，不计入
        maxJumpRatio: 1.2,  // 单次位移超过「屏幕对角线 × 该比例」判定为瞬移/切屏，丢弃
        crossScreenSkip: true // 跨显示器时丢弃这一段
      },
      calibration: {
        mode: 'diagonal',      // 'diagonal' | 'manual'
        diagonalInch: 24,      // 默认 24 英寸（16:9 常见桌面显示器）
        perDisplay: {},        // { [displayId]: number } 多显示器单独校准（英寸）
        factor: 1.0,           // 校准滑块 0.50 ~ 2.00
        manualCmPerPoint: null // manual 模式下直接指定「每点(px)对应厘米」
      },
      journey: {
        mode: 'random',        // 'random' | 'fixed'
        routeId: 'jinghu',     // 固定路线 id
        kmPerMeter: 1,         // 真实 1 米 = 地图 1 公里
        autoNext: true,        // 抵达终点后自动开启下一段随机旅程
        showSpotCards: true
      },
      health: {
        enabled: true,
        thresholdMin: 45,      // 连续使用阈值（分钟）
        snoozeMin: 10,         // 稍后提醒间隔
        idleResetSec: 120,     // 静止超过该秒数视为已休息
        useNotification: true,
        title: '该起身活动一下啦 🧘',
        message: '你已经连续使用鼠标 {min} 分钟了。站起来走走，看看 6 米以外的地方 20 秒吧。'
      },
      float: {
        visible: true,
        collapsed: false,
        opacity: 0.96,
        alwaysOnTopLevel: 'floating', // 'floating' | 'screen-saver'(可覆盖全屏应用)
        x: null,
        y: null,
        showRoute: true
      },
      general: {
        launchAtLogin: false,
        closeToTray: true
      }
    },
    days: {},          // { 'YYYY-MM-DD': { distanceCm, moves, activeMs, firstTs, lastTs } }
    totals: { distanceCm: 0, moves: 0, activeMs: 0, days: 0 },
    achievements: {},  // { id: ISO 时间字符串 }
    journey: null,     // 当前旅程快照（见 journey.js）
    journeyLog: []     // 已完成旅程记录
  };
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!patch || typeof patch !== 'object') return out;
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), FILE_NAME);
    this.fileName = FILE_NAME;
    this.data = this._load();
    this._timer = null;
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return deepMerge(defaults(), parsed);
    } catch (err) {
      // 文件不存在（首次运行）属正常；解析失败说明存档损坏：
      // 先把损坏文件改名保留，避免下次 flush 用全新 defaults 覆盖、历史数据彻底丢失
      if (fs.existsSync(this.file)) {
        try {
          const backup = `${this.file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
          fs.renameSync(this.file, backup);
          console.error('[store] 存档解析失败，已保留损坏文件：', backup, '\n', err);
        } catch (_) { /* 备份失败不阻塞启动 */ }
      }
      return defaults();
    }
  }

  /** 原子写：先写临时文件再 rename，避免崩溃/断电导致 JSON 截断 */
  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] 写入失败', err);
    }
  }

  /** 高频调用时用：合并 1.5s 内的多次写入 */
  saveSoon() {
    if (this._timer) return;
    this._timer = setTimeout(() => this.flush(), 1500);
    if (this._timer.unref) this._timer.unref();
  }

  get settings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = deepMerge(this.data.settings, patch);
    this.saveSoon();
    return this.data.settings;
  }

  /** 取（并按需创建）某天的记录 */
  day(key) {
    if (!this.data.days[key]) {
      this.data.days[key] = { distanceCm: 0, moves: 0, activeMs: 0, firstTs: Date.now(), lastTs: Date.now(), track: [] };
    } else if (!Array.isArray(this.data.days[key].track)) {
      this.data.days[key].track = [];
    }
    return this.data.days[key];
  }

  today() {
    return this.day(dayKey());
  }

  /** 只保留最近 N 天的明细，避免文件无限增长 */
  pruneDays(keepDays = 730) {
    const keys = Object.keys(this.data.days).sort();
    if (keys.length <= keepDays) return;
    for (const k of keys.slice(0, keys.length - keepDays)) delete this.data.days[k];
  }

  /** 只保留最近 keepTrackDays 天的轨迹点（历史轨迹对热力图无意义，且占空间） */
  pruneTrack(keepTrackDays = 14) {
    const keys = Object.keys(this.data.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - keepTrackDays))) {
      const rec = this.data.days[k];
      if (rec && Array.isArray(rec.track) && rec.track.length) rec.track = [];
    }
  }
}

module.exports = Store;
