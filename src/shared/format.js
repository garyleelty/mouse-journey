'use strict';
/** 共享格式化工具（主进程与渲染进程通用） */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Fmt = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  /** 本地日期键 YYYY-MM-DD（按用户所在时区） */
  function dayKey(ts) {
    const d = ts == null ? new Date() : new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** 距离：小于 1 米用厘米，小于 1 公里用米，否则公里 */
  function formatDistance(meters) {
    const m = Number(meters) || 0;
    if (m < 1) return `${(m * 100).toFixed(1)} cm`;
    // 999.96 起四舍五入就是 1.0 km，直接按公里显示，避免出现「1000.0 m」
    if (m < 999.95) return `${m.toFixed(m < 10 ? 2 : 1)} m`;
    return `${(m / 1000).toFixed(2)} km`;
  }

  /** 时长：1h23m / 23m05s */
  function formatDuration(ms) {
    const s = Math.floor((Number(ms) || 0) / 1000);
    const h = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${String(mm).padStart(2, '0')}m`;
    if (mm > 0) return `${mm}m ${String(ss).padStart(2, '0')}s`;
    return `${ss}s`;
  }

  /** 星期几 */
  function weekdayLabel(dateStr) {
    const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const d = new Date(`${dateStr}T00:00:00`);
    return w[d.getDay()];
  }

  /** 日期加减 n 天：用 setDate 步进，避免毫秒偏移在夏令时切换日跳天/重复 */
  function shiftDay(ts, delta) {
    const d = new Date(ts);
    d.setDate(d.getDate() + delta);
    return d.getTime();
  }

  /** 最近 n 天（含今天）的日期键数组，正序 */
  function lastNDays(n, fromTs) {
    const out = [];
    const base = fromTs == null ? Date.now() : fromTs;
    for (let i = n - 1; i >= 0; i--) out.push(dayKey(shiftDay(base, -i)));
    return out;
  }

  /** 本周（周一为起点）的日期键数组 */
  function currentWeekDays(fromTs) {
    const base = fromTs == null ? Date.now() : fromTs;
    const dow = (new Date(base).getDay() + 6) % 7; // 0=周一
    const out = [];
    for (let i = 0; i < 7; i++) out.push(dayKey(shiftDay(base, i - dow)));
    return out;
  }

  /** 字节数：1.2 KB / 3.4 MB */
  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  return { dayKey, formatDistance, formatDuration, formatBytes, weekdayLabel, lastNDays, currentWeekDays, shiftDay };
});
