'use strict';

/**
 * 健康提醒：连续使用鼠标超过阈值 → 提醒起身休息。
 * - 连续时长只在「持续有鼠标活动」时累加；
 * - 静止超过 idleResetSec（默认 120s）自动归零（视为已经休息过了）；
 * - 系统休眠/锁屏也会归零（由 tracker 的 paused 事件驱动）；
 * - 提醒后进入 snoozeMin 分钟的静默期；点击「已休息」则直接归零。
 */
class Health {
  constructor(store) {
    this.store = store;
    this.continuousMs = 0;
    this.snoozeUntil = 0;
    this.lastNotifyTs = 0;
  }

  reset() {
    this.continuousMs = 0;
  }

  snooze() {
    const s = this.store.settings.health;
    this.snoozeUntil = Date.now() + Math.max(1, s.snoozeMin) * 60_000;
  }

  /**
   * @param {{movedNow:boolean, deltaMs:number, idleMs:number, skipped?:boolean}} tick
   * @returns {null | {minutes:number, title:string, message:string}}
   */
  onTick(tick) {
    const s = this.store.settings.health;
    if (!s.enabled) return null;
    if (tick.skipped) return null;

    const now = Date.now();
    const idleLimit = Math.max(10, s.idleResetSec) * 1000;

    if (tick.idleMs > idleLimit) {
      // 已经停手足够久 → 视为休息过，重新计时
      this.continuousMs = 0;
      return null;
    }

    this.continuousMs += Math.max(0, tick.deltaMs || 0);

    if (now < this.snoozeUntil) return null;

    const limitMs = Math.max(1, s.thresholdMin) * 60_000;
    if (this.continuousMs >= limitMs) {
      this.continuousMs = 0; // 提醒一次后重新开始计时
      const minutes = Math.round(limitMs / 60000);
      return {
        minutes,
        title: s.title || '该起身活动一下啦',
        message: (s.message || '你已经连续使用鼠标 {min} 分钟了，起身活动一下吧。').replace('{min}', String(minutes))
      };
    }
    return null;
  }
}

module.exports = Health;
