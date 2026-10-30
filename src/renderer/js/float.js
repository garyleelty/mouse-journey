'use strict';

/* global api, Geo, Fmt, MapKit, SceneryKit, Icons */

const S = {
  state: null, shownKm: 0, targetKm: 0, lastDraw: 0, view: 'road',
  lean: { dir: 0, since: 0, active: false }, // 顺弯压弯状态机
  camRoll: 0,                                // 相机侧倾（平滑后的目标值）
  ghostArmed: null                           // 幽灵超车武装位：null=未武装
};
const $ = (id) => document.getElementById(id);

function setView(view) {
  S.view = view;
  $('f-view').innerHTML = Icons.svg(view === 'road' ? 'route' : 'flag', 13);
  $('f-view').title = view === 'road' ? '切换到地图' : '切换到路上';
  $('f-marker').hidden = view !== 'map';
}

function setCollapsed(collapsed) {
  $('fw').classList.toggle('collapsed', collapsed);
  $('f-collapse').innerHTML = Icons.svg(collapsed ? 'chevron' : 'chevron', 13);
  $('f-collapse').style.transform = collapsed ? 'rotate(180deg)' : '';
  api.setCollapsed(collapsed);
}

function fmtMeters(m) {
  const v = Number(m) || 0;
  return v < 1000 ? `${v.toFixed(v < 10 ? 2 : 1)} m` : `${(v / 1000).toFixed(2)} km`;
}

function renderHud() {
  const st = S.state;
  if (!st || !st.journey) return;
  $('f-dist').textContent = fmtMeters(st.today.meters);
  $('f-mount').innerHTML = Icons.mountIcon(st.mount.id, 14);
  $('f-pos').textContent = `${st.journey.progressKm} / ${st.journey.totalKm} km`;
  $('f-next').textContent = st.journey.nextSpot
    ? `下一景点 ${st.journey.nextSpot.name}`
    : (st.journey.nextCity ? `下一站 ${st.journey.nextCity.name}` : (st.journey.remainKm <= 0 ? '已抵达终点' : '终点在望'));

  // 能量槽 / 冲刺计时 / 倍率徽章
  const b = st.journey.boost;
  const row = $('f-boost-row');
  const bar = $('f-boost-bar');
  if (b) {
    row.classList.toggle('whip', b.whipRemainS > 0);
    row.classList.toggle('ready', b.whipRemainS <= 0 && b.energy >= 1);
    bar.style.width = b.whipRemainS > 0
      ? `${Math.min(100, (b.whipRemainS / 15) * 100)}%`
      : `${Math.round(b.energy * 100)}%`;
    const m = $('f-mult');
    if (b.gameMult > 1) {
      m.hidden = false;
      m.textContent = `×${b.gameMult}`;
    } else {
      m.hidden = true;
    }
  }
}

function draw(ts) {
  requestAnimationFrame(draw);
  const st = S.state;
  if (!st || !st.geo || !st.journey) return;

  // 平滑插值：主进程 2Hz 推送，悬浮窗内部做补间，避免小人「跳帧」
  S.targetKm = st.journey.progressKm;
  S.shownKm += (S.targetKm - S.shownKm) * 0.18;
  if (Math.abs(S.targetKm - S.shownKm) < 0.01) S.shownKm = S.targetKm;

  if (ts - S.lastDraw < 40) return; // ~25fps，够用且省电
  S.lastDraw = ts;

  if (S.view === 'road') {
    const j = st.journey;
    let nextCity = null;
    if (j.nextCity && Array.isArray(j.cum)) {
      const at = j.cum[Math.min(j.cityIndex + 1, j.cum.length - 1)];
      nextCity = { name: j.nextCity.name, lon: j.nextCity.lon, lat: j.nextCity.lat, kmAhead: Math.max(0, at - j.progressKm) };
    }
    const b = j.boost;
    const whipOn = !!(b && b.whipRemainS > 0);
    const ghostOpt = (st.ghost && st.ghost.have)
      ? { aheadKm: (st.ghost.meters - st.today.meters) / 1000 }
      : null;
    const info = SceneryKit.render($('f-map'), {
      route: j,
      progressKm: S.shownKm,
      visitedSpots: j.visitedSpots,
      nextCity,
      compact: true,
      roll: S.camRoll,
      boost: { whip: whipOn },
      ghost: ghostOpt
    });

    /* 顺弯压弯：弯道中（前方 120m 路心偏移 > 4m）且鼠标水平速度与弯向一致并保持 1.5s */
    const vx = st.vx || 0;
    const cornering = !!(info && info.bendMag > 4);
    if (cornering && info.bendDir !== 0 && Math.sign(vx) === info.bendDir && Math.abs(vx) > 60) {
      if (!S.lean.since || S.lean.dir !== info.bendDir) {
        S.lean.dir = info.bendDir;
        S.lean.since = ts;
      }
      if (!S.lean.active && ts - S.lean.since > 1500) {
        S.lean.active = true;
        api.setLean(true);
      }
    } else if (S.lean.active || S.lean.since) {
      if (S.lean.active) api.setLean(false);
      S.lean.active = false;
      S.lean.since = 0;
    }

    // 相机侧倾目标：压弯向弯内倾 + 冲刺轻微抖动
    const rollTarget = (S.lean.active && info ? info.bendDir * 0.05 : 0) + (whipOn ? Math.sin(ts / 90) * 0.006 : 0);
    S.camRoll += (rollTarget - S.camRoll) * 0.12;
    return;
  }

  const pos = MapKit.render($('f-map'), {
    rings: st.geo.rings,
    context: st.geo.context,
    bbox: st.geo.bbox,
    route: st.journey,
    progressKm: S.shownKm,
    visitedSpots: st.journey.visitedSpots,
    heading: st.journey.heading,
    showRoute: st.settings && st.settings.float ? st.settings.float.showRoute !== false : true,
    compact: true
  });
  const marker = $('f-marker');
  if (pos) {
    marker.hidden = false;
    marker.innerHTML = Icons.mountIcon(st.mount.id, 11);
    marker.style.left = `${pos.x}px`;
    marker.style.top = `${pos.y}px`;
  } else {
    marker.hidden = true;
  }
}

/** 幽灵超车检测：今日里程从落后昨日 ≥200m 翻到领先 ≥50m 记一次（带迟滞防抖） */
function detectGhostPass() {
  const st = S.state;
  if (!st || !st.ghost || !st.ghost.have) return;
  const delta = st.today.meters - st.ghost.meters; // >0 = 你领先
  if (delta < -200) {
    S.ghostArmed = true;
  } else if (S.ghostArmed && delta > 50) {
    S.ghostArmed = null;
    flashRow();
    api.ghostPass();
  }
}

/** 能量条闪一下：冲刺结束 / 超越幽灵的轻反馈 */
function flashRow() {
  const row = $('f-boost-row');
  row.classList.remove('deny');
  void row.offsetWidth; // 重启动画
  row.classList.add('deny');
  setTimeout(() => row.classList.remove('deny'), 300);
}

async function onWhip() {
  await api.whip();
  flashRow(); // 成功 = 起跑提示；能量不足 = 拒绝提示（同一段轻抖动）
}

async function init() {
  $('f-collapse').innerHTML = Icons.svg('chevron', 13);
  $('f-pin').innerHTML = Icons.svg('pinTop', 13);
  $('f-main').innerHTML = Icons.svg('gear', 13);
  $('f-hide').innerHTML = Icons.svg('close', 13);
  setView('road');

  S.state = await api.getState();
  S.shownKm = S.state.journey ? S.state.journey.progressKm : 0;

  setCollapsed(!!S.state.settings.float.collapsed);
  $('f-opacity').value = Math.round((S.state.settings.float.opacity || 1) * 100);
  $('f-op-val').textContent = `${Math.round((S.state.settings.float.opacity || 1) * 100)}%`;
  renderHud();
  requestAnimationFrame(draw);

  api.on('state:update', (u) => {
    S.state.today = u.today;
    S.state.totals = u.totals;
    S.state.journey = u.journey;
    S.state.mount = u.mount;
    S.state.vx = u.vx;
    S.state.ghost = u.ghost;
    renderHud();
    detectGhostPass();
  });

  api.on('boost:event', (e) => {
    if (e && e.type === 'whipEnd') flashRow();
  });

  api.on('state:full', (f) => {
    // 换了路线（reroll/切固定路线/完赛开新段/重置今日）时进度从旧里程归零：
    // 直接把 shownKm 吸到新值，否则补间会把小人从上千 km 平滑「倒放」回 0
    const routeChanged = !S.state || !S.state.journey || !f.journey
      || S.state.journey.routeId !== f.journey.routeId;
    S.state = f;
    if (routeChanged) S.shownKm = f.journey ? f.journey.progressKm : 0;
    renderHud();
  });

  $('f-collapse').addEventListener('click', () => {
    const next = !$('fw').classList.contains('collapsed');
    setCollapsed(next);
  });

  $('f-view').addEventListener('click', () => setView(S.view === 'road' ? 'map' : 'road'));

  $('f-opacity').addEventListener('input', () => {
    const v = Number($('f-opacity').value) / 100;
    $('f-op-val').textContent = `${$('f-opacity').value}%`;
    api.setOpacity(v);
  });
  $('f-opacity').addEventListener('change', () => {
    api.updateSettings({ float: { opacity: Number($('f-opacity').value) / 100 } });
  });

  $('f-pin').addEventListener('click', () => {
    const cur = S.state.settings.float.alwaysOnTopLevel || 'floating';
    const next = cur === 'floating' ? 'screen-saver' : 'floating';
    api.updateSettings({ float: { alwaysOnTopLevel: next } }).then((f) => {
      S.state.settings = f.settings;
    });
    $('f-pin').innerHTML = Icons.svg(next === 'floating' ? 'pinTop' : 'lock', 13);
  });

  $('f-main').addEventListener('click', () => api.showMain());
  $('f-hide').addEventListener('click', () => api.hideFloat());

  // 点击主画面 = 抽鞭冲刺（能量满时触发）
  $('f-map').addEventListener('click', onWhip);

  // 双击头部折叠/展开
  $('fh').addEventListener('dblclick', () => setCollapsed(!$('fw').classList.contains('collapsed')));
}

init();
