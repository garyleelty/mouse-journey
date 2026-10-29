/* harness 专用：在无 Electron 环境里提供 window.api（taste-skill 检查器用） */
(function () {
  'use strict';
  const listeners = {};
  let state = null;

  async function getState() {
    if (!state) {
      const res = await fetch('mock-state.json');
      state = await res.json();
      // 统计页派生序列（与主进程 series 相同口径）
      const keys = Object.keys(state.rawDays).sort();
      state.recent = keys.slice(-14).map((k) => {
        const d = state.rawDays[k];
        return { key: k, meters: Number((d.distanceCm / 100).toFixed(3)), moves: d.moves, activeMs: d.activeMs };
      });
      const dow = (new Date().getDay() + 6) % 7;
      state.week = [];
      for (let i = 0; i <= dow; i++) {
        const k = new Date(Date.now() - (dow - i) * 86400000);
        const key = `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`;
        const d = state.rawDays[key] || { distanceCm: 0, moves: 0, activeMs: 0 };
        state.week.push({ key, meters: Number((d.distanceCm / 100).toFixed(3)), moves: d.moves, activeMs: d.activeMs });
      }
    }
    return state;
  }

  window.api = {
    getState,
    on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); },
    async pause() { return state; },
    async resetDay() { return state; },
    async exportData() { return { ok: false, canceled: true }; },
    async calibrationDone() { state.needsCalibration = false; return Date.now(); },
    async testReminder() {},
    async reroll() { return state; },
    async setJourneyMode() { return state; },
    async updateSettings() { return state; },
    async setOpacity() {},
    async openFolder() {},
    async displays() { return state.displays; },
    async calibrationPreview() { return state.displays[0]; },
    async accessibility() { return { platform: 'darwin', trusted: true }; }
  };

  /* hash 直达某个 tab，方便逐屏截图：#today #stats #journey #achv #settings */
  const tab = location.hash.replace('#', '');
  if (tab) {
    const boot = setInterval(() => {
      const btn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
      const active = document.querySelector(`#tab-${tab}.active`);
      if (btn && !active) btn.click();
      if (active) clearInterval(boot);
    }, 100);
    setTimeout(() => clearInterval(boot), 15000);
  }
})();
