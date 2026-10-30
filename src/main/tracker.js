'use strict';

const { EventEmitter } = require('node:events');
const { screen, powerMonitor } = require('electron');
const { dayKey } = require('../shared/format');
const { cmPerPointFor } = require('./calibration');

const ACTIVE_WINDOW_MS = 60_000; // 距上一次移动 60s 内视为「活跃中」
const MOVE_GAP_MS = 300;         // 两次位移间隔超过 300ms → 计为「新的一次移动」
const BIG_GAP_MS = 5_000;        // 采样间隔异常（休眠唤醒 / CG 事件丢失）→ 丢弃这段

/* ---- 轨迹采样（用于「今日热力图」）---- */
const TRACK_MIN_DIST_PX = 10;    // 距上一个采样点超过该距离才记录，避免密集成团
const TRACK_MIN_GAP_MS = 120;    // 两次采样最小时间间隔
const TRACK_MAX_POINTS = 4000;   // 单日上限，超出后按比例抽稀

/**
 * 鼠标采样器：在主进程后台以固定周期轮询光标坐标，按像素累加并换算为物理距离。
 * 事件：
 *   'tick'   { deltaCm, movedNow, newMove, deltaMs, idleMs, displayId }
 *   'day'    { key } 跨天（本地时区）
 */
class Tracker extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.timer = null;
    this.running = false;

    this.currentDay = dayKey();
    this.lastPoint = null;
    this.lastDisplayId = null;
    this.lastTickTs = 0;
    this.lastMoveTs = 0;
    this.moveOpen = false; // 是否处于「一次连续移动」中
    this.vx = 0;           // 水平速度（px/s，EMA 平滑），供「顺弯压弯」判定用
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._resetBaseline();
    this._schedule();
    this._bindSystemEvents();
  }

  _bindSystemEvents() {
    if (this._sysBound) return;
    this._sysBound = true;
    this._onSuspend = () => this._pause('suspend');
    this._onResume = () => this._resume('resume');
    this._onLock = () => this._pause('lock-screen');
    this._onUnlock = () => this._resume('unlock-screen');
    powerMonitor.on('suspend', this._onSuspend);
    powerMonitor.on('resume', this._onResume);
    powerMonitor.on('lock-screen', this._onLock);
    powerMonitor.on('unlock-screen', this._onUnlock);
    screen.on('display-added', this._resetBaseline);
    screen.on('display-removed', this._resetBaseline);
    screen.on('display-metrics-changed', this._resetBaseline);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this._sysBound) {
      powerMonitor.removeListener('suspend', this._onSuspend);
      powerMonitor.removeListener('resume', this._onResume);
      powerMonitor.removeListener('lock-screen', this._onLock);
      powerMonitor.removeListener('unlock-screen', this._onUnlock);
      screen.removeListener('display-added', this._resetBaseline);
      screen.removeListener('display-removed', this._resetBaseline);
      screen.removeListener('display-metrics-changed', this._resetBaseline);
      this._sysBound = false;
    }
  }

  _schedule() {
    if (this.timer) clearInterval(this.timer);
    const interval = Math.max(16, this.store.settings.sampling.intervalMs || 80);
    this.timer = setInterval(() => this._tick(), interval);
  }

  /** 采样频率改变后需要重建定时器 */
  refreshInterval() {
    if (this.running) this._schedule();
  }

  _resetBaseline() {
    this.lastPoint = null;
    this.lastDisplayId = null;
    this.lastTickTs = Date.now();
    this.moveOpen = false;
    this._lastTrackPoint = null;
    this.vx = 0;
  }

  _pause(reason) {
    // 休眠/锁屏：停止累加（避免唤醒瞬间的大位移被误计入）
    this.paused = true;
    this._resetBaseline();
    this.emit('paused', reason);
  }

  _resume(reason) {
    this.paused = false;
    this._resetBaseline();
    this.emit('resumed', reason);
  }

  _tick() {
    if (!this.running || this.paused) return;
    const now = Date.now();
    const deltaMs = this.lastTickTs ? now - this.lastTickTs : 0;
    this.lastTickTs = now;

    // 采样间隔异常（系统休眠后唤醒、主线程长阻塞）→ 丢弃这一段，只更新基线
    if (deltaMs > BIG_GAP_MS) {
      this._resetBaseline();
      // idleMs 视为无穷大：唤醒等同「已休息」，健康连续计时归零
      this.emit('tick', { deltaCm: 0, movedNow: false, newMove: false, deltaMs, idleMs: Infinity, vx: 0, displayId: null, skipped: true });
      return;
    }

    // 跨天：滚动到新的一天
    const key = dayKey(now);
    if (key !== this.currentDay) {
      this.currentDay = key;
      this.store.pruneDays();
      this.store.saveSoon();
      this.emit('day', { key });
    }

    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const cal = this.store.settings.calibration;
    const s = this.store.settings.sampling;

    if (!this.lastPoint) {
      this.lastPoint = point;
      this.lastDisplayId = display.id;
      return;
    }

    const dx = point.x - this.lastPoint.x;
    const dy = point.y - this.lastPoint.y;
    const distPx = Math.hypot(dx, dy);

    let deltaCm = 0;
    let movedNow = false;
    let newMove = false;

    // 判定：有效位移（超过死区）
    if (distPx >= (s.deadZonePx || 0)) {
      // 判定：瞬移 / 切屏 / 显示器切换 → 丢弃
      const diagDip = Math.hypot(display.size.width, display.size.height);
      const maxJump = diagDip * (s.maxJumpRatio || 1.2);
      const displayChanged = this.lastDisplayId != null && display.id !== this.lastDisplayId;

      if (distPx <= maxJump && !(displayChanged && s.crossScreenSkip)) {
        deltaCm = distPx * cmPerPointFor(display, cal);
        movedNow = deltaCm > 0;
      }
    }

    if (movedNow) {
      const sinceLastMove = now - this.lastMoveTs;
      if (!this.moveOpen || sinceLastMove > MOVE_GAP_MS) {
        newMove = true;
        this.moveOpen = true;
      }
      this.lastMoveTs = now;
    } else if (this.moveOpen && now - this.lastMoveTs > MOVE_GAP_MS) {
      this.moveOpen = false;
    }

    this.lastPoint = point;
    this.lastDisplayId = display.id;

    if (deltaCm > 0 || newMove) this._accumulate(deltaCm, newMove, deltaMs, now);

    // 轨迹采样：归一化到 [0,1]，与分辨率/显示器数量无关，热力图渲染时再按屏幕排布
    if (movedNow) {
      const wa = display.workArea || { x: 0, y: 0, width: display.size.width, height: display.size.height };
      const last = this._lastTrackPoint;
      const far = last
        ? Math.hypot(point.x - last.x, point.y - last.y) >= TRACK_MIN_DIST_PX
        : true;
      if (far && (!last || now - last.t >= TRACK_MIN_GAP_MS)) {
        this._lastTrackPoint = { x: point.x, y: point.y, t: now };
        this._pushTrack({
          // 以整个桌面为坐标空间（多显示器并集），跨屏也能落到正确位置
          x: point.x,
          y: point.y,
          w: wa.width,
          h: wa.height,
          d: display.id
        });
      }
    }

    // 尚未发生过任何移动（lastMoveTs=0）时视为「一直静止」：
    // 否则启动后挂着不动也会被健康模块当作连续使用累加
    const idleMs = this.lastMoveTs ? now - this.lastMoveTs : Infinity;

    // 水平速度 EMA（压弯判定用）：包含死区内的小位移，方向信息比幅度重要
    if (deltaMs > 0) {
      const instVx = dx / (deltaMs / 1000);
      this.vx = this.vx * 0.75 + instVx * 0.25;
    }
    this.emit('tick', { deltaCm, movedNow, newMove, deltaMs, idleMs, vx: this.vx, displayId: display.id });
  }

  /** 写入一条轨迹点；超过上限时按 1/2 抽稀，保证长会话不会撑爆存储 */
  _pushTrack(p) {
    const rec = this.store.today();
    if (!rec.track) rec.track = [];
    rec.track.push(p);
    if (rec.track.length > TRACK_MAX_POINTS) {
      rec.track = rec.track.filter((_v, i) => i % 2 === 0);
    }
  }

  _accumulate(deltaCm, newMove, deltaMs, now) {
    const rec = this.store.today();
    const totals = this.store.data.totals;

    if (deltaCm > 0) {
      rec.distanceCm += deltaCm;
      totals.distanceCm += deltaCm;
    }
    if (newMove) {
      rec.moves += 1;
      totals.moves += 1;
    }

    // 活跃时长：只要「距上次移动」在 ACTIVE_WINDOW_MS 内，就把这一帧计入活跃
    const idle = this.lastMoveTs ? now - this.lastMoveTs : Infinity;
    if (idle <= ACTIVE_WINDOW_MS && deltaMs > 0 && deltaMs < BIG_GAP_MS) {
      rec.activeMs += deltaMs;
      totals.activeMs += deltaMs;
    }

    rec.lastTs = now;
    if (!rec.firstTs) rec.firstTs = now;
    this.store.saveSoon();
  }
}

module.exports = Tracker;
