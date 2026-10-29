'use strict';
/** 内置 SVG 图标（线性、1.5px 描边、继承 currentColor）——替代 emoji，符合无装饰原则 */
(function () {
  const P = {
    // 导航
    today: '<path d="M3 5.5 8 2l5 3.5v7L8 14l-5-1.5v-7Z"/><path d="M8 2v12"/>',
    stats: '<path d="M3 13V9m4.5 4V5.5M12 13v-6m4.5 6V3"/>',
    route: '<path d="M5 13c0-2.5 2-3.5 5.5-3.5S14 8 14 5.5 12 2 9.5 2C7 2 5 3.5 5 5.5"/><path d="M11 13c0 2.5-2 3.5-5.5 3.5S2 15.5 2 13s2-3.5 4.5-3.5S11 10.5 11 13Z"/><circle cx="9.5" cy="5.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="13" r="1.4" fill="currentColor" stroke="none"/>',
    medal: '<circle cx="8" cy="9.5" r="4.5"/><path d="M5.5 13.5 4 21l4-2 4 2-1.5-7.5"/><path d="M8 6.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L5.1 8.6l2-.3L8 6.5Z"/>',
    gear: '<circle cx="8" cy="8" r="2.4"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/>',
    // 品牌：光标 + 轨迹
    brand: '<path d="M4 2.5 12.5 9l-3.6.6L10 14l-2 .8-1.2-3.8L4 13.5v-11Z"/><path d="M13.5 13.5c1.5 1.5 1.5 3 0 4.5" stroke-dasharray="1.5 1.5"/>',
    // 坐骑
    walk: '<circle cx="9" cy="3.2" r="1.6"/><path d="M9 5.5 7.5 9.5 5 13.5M9 5.5l2.5 2 1 3M9 5.5 6 7M9 5.5l3-.5"/>',
    bike: '<circle cx="4.5" cy="11.5" r="3"/><circle cx="12" cy="11.5" r="3"/><path d="M4.5 11.5 7.5 6h3l1.5 5.5M7.5 6 10 11.5M9 6H6"/>',
    bus: '<rect x="3" y="3.5" width="10.5" height="9" rx="1.5"/><path d="M3 8h10.5M6 3.5v4.5M10.5 3.5v4.5M5.5 12.5v1.5M11 12.5v1.5"/>',
    car: '<path d="M2.5 11.5h11M4 11.5l1.5-4h7l1.5 4M4 11.5v2.5h2.5v-2.5M11 11.5v2.5h2.5v-2.5"/><circle cx="6" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="11.5" r="1" fill="currentColor" stroke="none"/>',
    train: '<path d="M4 3.5h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z"/><path d="M3.5 8h11M7 13.5 5.5 15.5M11 13.5l1.5 2M6.5 5.5h5"/>',
    plane: '<path d="M2 9.5 13.5 6l-2-2.5L9 5 7 2.5 5.5 3l1.5 3-3 .8-1.5-1.5L1.5 6l1 2 2 .5L2 9.5Z"/><path d="M2 9.5 3.5 13l1.5-.5-.5-2.5"/>',
    // 界面小图标
    menu: '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>',
    check: '<path d="M3 8.5 6.5 12 13 4.5"/>',
    dot: '<circle cx="8" cy="8" r="3.5" fill="currentColor" stroke="none"/>',
    pin: '<path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3.5-4.5 8.5-4.5 8.5S3.5 9.5 3.5 6A4.5 4.5 0 0 1 8 1.5Z"/><circle cx="8" cy="6" r="1.6"/>',
    flag: '<path d="M4 2v12M4 3h9l-1.5 3L13 9H4"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
    ruler: '<path d="M2 6h12v4H2z"/><path d="M5 6v2M8 6v2M11 6v2"/>',
    mouse: '<rect x="5" y="2" width="6" height="12" rx="3"/><path d="M8 2v3.5"/>',
    refresh: '<path d="M13 8A5 5 0 1 1 8 3c1.8 0 3.4.9 4.3 2.3M13 2v3h-3"/>',
    download: '<path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12.5h10"/>',
    folder: '<path d="M2 4.5h4l1.5 2H14v7H2v-9Z"/>',
    pinTop: '<path d="M8 2v6m0 0 3-3M8 8 5 5"/><path d="M3.5 10.5h9M5 13.5h6"/>',
    lock: '<rect x="4" y="7" width="8" height="6.5" rx="1"/><path d="M5.8 7V5.2a2.2 2.2 0 0 1 4.4 0V7"/>',
    chevron: '<path d="M5 3.5 8 6.5l3-3"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    bell: '<path d="M8 2a4 4 0 0 1 4 4c0 3 1.5 4 1.5 4h-11S4 9 4 6a4 4 0 0 1 4-4Z"/><path d="M6.5 12.5a1.8 1.8 0 0 0 3 0"/>',
    flame: '<path d="M8 1.5S4.5 5.5 4.5 9A3.5 3.5 0 0 0 11.5 9c0-1.5-.8-2.8-1.5-3.8 0 1.5-1 2.3-2 2.3.3-2.2-.5-4.2-1-6Z"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    dice: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>'
  };

  /** 生成一段 svg；name 见 P；size px */
  function svg(name, size = 16, cls = '') {
    const d = P[name];
    if (!d) return '';
    return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  /** 坐骑 id → 图标名 */
  const MOUNT_ICON = { walk: 'walk', bike: 'bike', bus: 'bus', car: 'car', train: 'train', plane: 'plane' };
  const mountIcon = (id, size = 16, cls = '') => svg(MOUNT_ICON[id] || 'walk', size, cls);

  window.Icons = { svg, mountIcon, MOUNT_ICON };
})();
