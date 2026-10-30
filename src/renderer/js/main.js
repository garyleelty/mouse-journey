'use strict';

/* global api, Geo, Fmt, MapKit, HeatMap, Charts, Icons */

const $ = (id) => document.getElementById(id);
const S = { state: null, settingsFilled: false, statsRange: 'week', chartData: [], tableExpanded: false, tab: 'today', speed: null };

const NAV_ICONS = { today: 'today', stats: 'stats', route: 'route', achv: 'medal', settings: 'gear' };
const NAV_LABELS = { today: '今日', stats: '统计', route: '路线', achv: '成就', settings: '设置' };

/* ------------------------------------------------------------------ 工具 */
const meters = (v) => Number(v) || 0;

/** 页面标题与副标题（每个屏一个 h1 + 一行答案） */
function renderPageHead() {
  const st = S.state;
  const tab = S.tab;
  $('page-title').textContent = NAV_LABELS[tab] || '今日';
  let sub = '';
  if (tab === 'today') sub = st ? todayFinding(st) : '';
  else if (tab === 'stats') sub = statsFinding();
  else if (tab === 'journey') {
    sub = st && st.journey ? (st.journey.desc || '') : '';
    if (st && st.journey) $('page-title').textContent = st.journey.name;
  }
  else if (tab === 'achv') {
    const list = (st && st.achievements) || [];
    sub = `${list.filter((a) => a.unlocked).length} / ${list.length} 已解锁 · 当前坐骑 ${st && st.mount ? st.mount.name : '步行'}`;
  } else if (tab === 'settings') sub = '距离换算、采样、提醒与悬浮窗。';
  $('page-sub').textContent = sub;
}

/** 今日发现：距下一景点还差多少 + 连续使用时长（屏幕的一句话答案） */
function todayFinding(st) {
  const d = new Date();
  const date = `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${Fmt.weekdayLabel(Fmt.dayKey())}`;
  const j = st.journey;
  let gap = '路线已全部走完';
  if (j && j.nextSpot) {
    const remain = Math.max(0, j.nextSpot.atKm - j.progressKm);
    gap = `距${j.nextSpot.name}还差 ${remain.toFixed(1)} km`;
  } else if (j && j.nextCity) {
    gap = `下一站 ${j.nextCity.name}`;
  }
  const cont = st.continuousMs >= 60000 ? ` · 连续使用 ${Math.floor(st.continuousMs / 60000)} 分钟` : '';
  return `${date} · ${gap}${cont}`;
}

function toast(icon, title, body, ms) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="ti">${Icons.svg(icon || 'dot', 16)}</div><div><div class="tt"></div><div class="tb"></div></div>`;
  el.querySelector('.tt').textContent = title;
  el.querySelector('.tb').textContent = body || '';
  $('toast-stack').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, ms || 5000);
}

function modal(glyph, title, body) {
  $('modal-glyph').innerHTML = Icons.svg(glyph || 'pin', 28);
  $('modal-title').textContent = title;
  $('modal-body').textContent = body || '';
  $('modal').classList.add('show');
}
$('modal-ok').addEventListener('click', () => $('modal').classList.remove('show'));
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) $('modal').classList.remove('show');
});

/* ------------------------------------------------------------------ 侧栏 */
function renderSidebar() {
  const st = S.state;
  const m = st.mount;
  $('side-mount-glyph').innerHTML = Icons.mountIcon(m.id, 18);
  $('side-mount-name').textContent = m.name;
  $('side-mount-bar').style.width = `${Math.round(Math.max(0, Math.min(1, m.progress)) * 100)}%`;
  $('side-mount-hint').textContent = m.next
    ? `累计 ${Fmt.formatDistance(st.totals.meters)} · 距${m.next.name}还差 ${Fmt.formatDistance(Math.max(0, m.next.minMeters - st.totals.meters))}`
    : `累计 ${Fmt.formatDistance(st.totals.meters)} · 已是最高级坐骑`;
  $('side-pause').checked = !!st.paused;
  $('side-pause-text').textContent = st.paused ? '已暂停' : '记录中';
  // 手机端底部抽屉同步
  const foot = $('nav-sheet-mount');
  if (foot) foot.innerHTML = `<div class="side-mount" style="margin:0"><div class="side-mount-head"><span class="side-mount-glyph">${Icons.mountIcon(m.id, 18)}</span><span class="side-mount-name">${m.name}</span></div><div class="side-mount-hint">${$('side-mount-hint').textContent}</div></div>`;
}

/* ------------------------------------------------------------------ 地图标记 */
function placeMarker(markerEl, canvas, pos) {
  if (!markerEl || !canvas) return;
  if (!pos) { markerEl.hidden = true; return; }
  markerEl.hidden = false;
  markerEl.innerHTML = Icons.mountIcon(S.state.mount.id, 14);
  markerEl.style.left = `${pos.x}px`;
  markerEl.style.top = `${pos.y}px`;
}

function drawMap(canvas, markerEl, compact) {
  const st = S.state;
  if (!st.geo || !st.journey) return;
  const pos = MapKit.render(canvas, {
    rings: st.geo.rings,
    context: st.geo.context,
    bbox: st.geo.bbox,
    route: st.journey,
    progressKm: st.journey.progressKm,
    visitedSpots: st.journey.visitedSpots,
    heading: st.journey.heading,
    compact: !!compact
  });
  placeMarker(markerEl, canvas, pos);
}

/** 第一人称「在路上」视角：镜头贴着路面往前看，纵深由真实路线几何算出 */
function drawScenery() {
  const st = S.state;
  const j = st.journey;
  if (!j || !j.points) return;
  const kmAhead = nextCityKm(j);
  const nextCity = j.nextCity && kmAhead != null
    ? { name: j.nextCity.name, lon: j.nextCity.lon, lat: j.nextCity.lat, kmAhead }
    : null;
  SceneryKit.render($('scene-today'), {
    route: { points: j.points, cum: j.cum, totalKm: j.totalKm, spots: j.spots },
    progressKm: j.progressKm,
    visitedSpots: j.visitedSpots,
    nextCity,
    compact: false
  });
}

/* ------------------------------------------------------------------ 今日 */
function renderWeekStrip() {
  const host = $('week-strip');
  if (!host) return;
  const series = statsSeries('week');
  const total = series.reduce((a, d) => a + d.meters, 0);
  $('week-total').textContent = Fmt.formatDistance(total);
  const W = Math.max(200, Math.round(host.clientWidth || 232));
  const H = 76, TOP = 58, GAP = 5, BW = (W - GAP * 6) / 7;
  const max = Math.max(...series.map((d) => d.meters), 1);
  const todayKey = Fmt.dayKey(Date.now());
  const dowChar = ['日', '一', '二', '三', '四', '五', '六'];
  let marks = '';
  series.forEach((d, i) => {
    const h = Math.max(2, Math.round((d.meters / max) * TOP));
    const x = i * (BW + GAP);
    const isToday = d.key === todayKey;
    marks += `<rect x="${x.toFixed(1)}" y="${(TOP - h).toFixed(1)}" width="${BW.toFixed(1)}" height="${h}" fill="${isToday ? '#1d5fbf' : '#c3c8d2'}"></rect>`;
    const dow = new Date(`${d.key}T00:00:00`).getDay();
    marks += `<text x="${(x + BW / 2).toFixed(1)}" y="72" text-anchor="middle" font-size="11" fill="${isToday ? '#0a0a0a' : '#8a8f99'}">${dowChar[dow]}</text>`;
  });
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="本周每日距离">${marks}</svg>`;
}

/** 下一站还有多少 km（沿路线累计里程算） */
function nextCityKm(j) {
  if (!j || !j.nextCity || !Array.isArray(j.cum)) return null;
  const at = j.cum[Math.min(j.cityIndex + 1, j.cum.length - 1)];
  return Math.max(0, at - j.progressKm);
}

/** 真实鼠标速度：由两次状态快照的里程差算出，停手超过 2.5 秒就显示静止 */
function updateSpeed() {
  const el = $('scene-speed');
  if (!el) return;
  const now = Date.now();
  const m = S.state.today.meters;
  const prev = S.speed;
  S.speed = { m, ts: now };
  if (!prev || now - prev.ts < 40 || now - prev.ts > 4000) {
    if (!prev || now - prev.ts > 2500) el.textContent = '静止';
    return;
  }
  const v = (m - prev.m) / ((now - prev.ts) / 1000); // m/s
  if (!(v > 0)) { el.textContent = '静止'; return; }
  el.textContent = v < 1 ? `${(v * 100).toFixed(0)} cm/s` : `${v.toFixed(2)} m/s`;
}

function renderToday() {
  const st = S.state;
  $('today-distance').textContent = Fmt.formatDistance(st.today.meters);
  $('today-moves').textContent = st.today.moves.toLocaleString();
  $('today-active').textContent = Fmt.formatDuration(st.today.activeMs);

  const cm = st.today.meters * 100;
  $('today-sub').textContent = cm > 0
    ? `≈ ${Math.round(cm / 30)} 把办公椅的宽度 · ${Math.round(st.today.meters * 1000 / 75)} 步左右`
    : '把鼠标动起来，小人就会出发';

  // 行程
  const j = st.journey;
  $('today-map-hint').textContent = j ? `${j.name} · ${j.progressKm} / ${j.totalKm} km` : '—';
  if (j) {
    const cityKm = nextCityKm(j);
    $('route-percent').textContent = `${Math.round(j.percent * 100)}%`;
    $('route-bar').style.width = `${Math.round(j.percent * 100)}%`;
    $('route-done').textContent = `${j.progressKm} km`;
    $('route-remain').textContent = `${j.remainKm} km`;
    $('route-next').textContent = j.nextCity ? j.nextCity.name : '已抵达终点';
    $('route-next-spot').textContent = j.nextSpot ? j.nextSpot.name : '—';

    // 倍率徽标（冲刺/压弯激活时）
    const rb = $('route-boost');
    const b = j.boost;
    if (b && b.gameMult > 1) {
      rb.hidden = false;
      rb.textContent = `×${b.gameMult} ${b.whipRemainS > 0 ? b.whipLabel : '压弯中'}`;
    } else {
      rb.hidden = true;
    }

    // 视角 HUD
    $('mini-percent').textContent = `${Math.round(j.percent * 100)}%`;
    $('scene-next').textContent = j.nextCity && cityKm != null
      ? `${j.nextCity.name} · ${cityKm.toFixed(1)} km`
      : '已抵达终点';
    $('scene-spot').textContent = j.nextSpot
      ? `${j.nextSpot.name} · ${Math.max(0, j.nextSpot.atKm - j.progressKm).toFixed(1)} km`
      : '—';
  }
  updateSpeed();
  drawScenery();

  // 下一个里程碑
  const next = (st.achievements || []).filter((a) => a.type === 'distance' && !a.unlocked).sort((a, b) => a.value - b.value)[0];
  if (next) {
    $('milestone-badge').textContent = next.name;
    $('milestone-bar').style.width = `${Math.round(next.progress * 100)}%`;
    $('milestone-text').textContent = `${Fmt.formatDistance(st.totals.meters)} / ${Fmt.formatDistance(next.value)} · ${next.desc}`;
  } else {
    $('milestone-badge').textContent = '全部达成';
    $('milestone-bar').style.width = '100%';
    $('milestone-text').textContent = `累计 ${Fmt.formatDistance(st.totals.meters)}，所有里程成就已解锁`;
  }

  // 本周条带
  renderWeekStrip();

  // 热力图
  const heatPts = st.track || [];
  $('heat-hint').textContent = heatPts.length ? `${heatPts.length} 个采样点` : '等待数据';
  HeatMap.render($('heat-today'), heatPts, st.screenLayout);
}

/* ------------------------------------------------------------------ 统计 */
function statsSeries(range) {
  const st = S.state;
  const days = st.rawDays || {};
  const pick = (keys) => keys.map((k) => {
    const d = days[k] || { distanceCm: 0, moves: 0, activeMs: 0 };
    return { key: k, meters: Number(((d.distanceCm || 0) / 100).toFixed(3)), moves: d.moves || 0, activeMs: d.activeMs || 0 };
  });
  const today = new Date();
  const keyOf = (dt) => Fmt.dayKey(dt.getTime());
  if (range === 'week') return pick(Fmt.currentWeekDays());
  if (range === 'lastweek') {
    const dow = (today.getDay() + 6) % 7;
    const monday = new Date(today.getTime() - (dow + 7) * 86400000);
    return pick([0, 1, 2, 3, 4, 5, 6].map((i) => keyOf(new Date(monday.getTime() + i * 86400000))));
  }
  if (range === 'month') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    return pick([...Array(dim).keys()].map((i) => `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`));
  }
  return pick(Fmt.lastNDays(14));
}

function statsFinding() {
  const series = statsSeries(S.statsRange);
  if (!series.length) return '—';
  const total = series.reduce((a, d) => a + d.meters, 0);
  const best = series.reduce((a, d) => (d.meters > a.meters ? d : a), series[0]);
  const rangeNames = { week: '本周', lastweek: '上周', month: '本月', '14': '近 14 天' };
  return `${rangeNames[S.statsRange] || ''}已走 ${Fmt.formatDistance(total)} · 最高 ${best.key} ${Fmt.formatDistance(best.meters)}`;
}

function renderStats() {
  const st = S.state;
  const series = statsSeries(S.statsRange);
  S.chartData = series;
  renderPageHead();
  const todayKey = Fmt.dayKey(Date.now());
  // 「本月」视图未来的空白天不进图表/明细，只画已经过去的日子
  const visible = series.filter((d) => d.key <= todayKey);

  // 鼠标悬停在图表上时跳过重建：hit 区被替换会让 tooltip 内容冻结
  const chartEl = $('chart-bars');
  if (!chartEl || !chartEl.matches(':hover')) {
    Charts.bars(chartEl, visible.map((d) => ({ key: d.key, label: d.key.slice(5), value: d.meters, moves: d.moves, activeMs: d.activeMs })), { tip: $('chart-tip') });
  }

  const past = visible;
  $('chart-range-hint').textContent = past.length ? `${past[0].key} ~ ${past[past.length - 1].key}` : '—';

  const tb = document.querySelector('#table-days tbody');
  tb.innerHTML = '';
  const rows = past.slice().reverse(); // 明细跟随所选周期，最新在上（不含未来的空白天）
  const CAP = 10;
  const shown = S.tableExpanded ? rows : rows.slice(0, CAP);
  shown.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${d.key}</td><td>${Fmt.weekdayLabel(d.key)}</td><td class="num">${Fmt.formatDistance(d.meters)}</td><td class="num">${d.moves.toLocaleString()}</td><td class="num">${Fmt.formatDuration(d.activeMs)}</td>`;
    tb.appendChild(tr);
  });
  const ex = $('table-expand');
  if (ex) {
    ex.hidden = rows.length <= CAP;
    ex.textContent = S.tableExpanded ? '收起' : `展开全部 ${rows.length} 天`;
  }

  $('table-total-line').textContent =
    `累计 ${Fmt.formatDistance(st.totals.meters)} · 活跃 ${Fmt.formatDuration(st.totals.activeMs)} · 连续 ${(st.metrics && st.metrics.streakDays) || 0} 天`;
  $('stats-total-hint').textContent = `共 ${st.daysTotal != null ? st.daysTotal : Object.keys(st.rawDays || {}).length} 天记录`;
  renderLeaderboard();
}

/** 里程排行榜：历史单日距离 Top 10（含今天，按当日实时进度参与排名） */
function renderLeaderboard() {
  const st = S.state;
  const days = st.rawDays || {};
  const rows = Object.entries(days)
    .map(([key, d]) => ({ key, meters: (d.distanceCm || 0) / 100, moves: d.moves || 0, activeMs: d.activeMs || 0 }))
    .sort((a, b) => (b.meters - a.meters) || (a.key < b.key ? 1 : -1))
    .slice(0, 10);
  const tb = document.querySelector('#table-rank tbody');
  tb.innerHTML = '';
  if (!rows.length || !(rows[0].meters > 0)) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-row">还没有可排名的记录</td></tr>';
    return;
  }
  rows.forEach((d, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="rank">${i + 1}</td><td>${d.key}</td><td>${Fmt.weekdayLabel(d.key)}</td><td class="num">${Fmt.formatDistance(d.meters)}</td><td class="num">${d.moves.toLocaleString()}</td><td class="num">${Fmt.formatDuration(d.activeMs)}</td>`;
    tb.appendChild(tr);
  });
}

function bindStatsRange() {
  $('stats-range').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    document.querySelectorAll('#stats-range .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    S.statsRange = btn.dataset.range;
    S.tableExpanded = false;
    renderStats();
  });
  const ex = $('table-expand');
  if (ex) ex.addEventListener('click', () => {
    S.tableExpanded = !S.tableExpanded;
    renderStats();
  });
}

/* ------------------------------------------------------------------ 路线 */
function renderJourney() {
  const st = S.state;
  const j = st.journey;
  if (!j) return;
  renderPageHead();
  $('journey-map-hint').textContent = `${j.progressKm} / ${j.totalKm} km`;
  $('route-percent-2').textContent = `${Math.round(j.percent * 100)}%`;
  $('route-bar-2').style.width = `${Math.round(j.percent * 100)}%`;
  $('route-done-2').textContent = `${j.progressKm} km`;
  $('route-remain-2').textContent = `${j.remainKm} km`;
  $('route-next-2').textContent = j.nextCity ? j.nextCity.name : '已抵达终点';

  const ul = $('spot-list');
  ul.innerHTML = '';
  const visited = new Set(j.visitedSpots);
  (j.spots || []).forEach((s) => {
    const li = document.createElement('li');
    const on = visited.has(s.id);
    li.className = 'spot-item' + (on ? '' : ' locked');
    li.innerHTML = `
      <div><div class="spot-name"></div><div class="spot-meta"></div><div class="spot-intro"></div></div>
      <div class="spot-state"></div>`;
    li.querySelector('.spot-name').textContent = s.name;
    li.querySelector('.spot-meta').textContent = `${s.city} · 第 ${s.atKm} km 处`;
    li.querySelector('.spot-intro').textContent = s.intro;
    li.querySelector('.spot-state').innerHTML = on
      ? '<span class="badge" style="color:var(--pill-positive-ink);background:var(--pill-positive-bg)">已抵达</span>'
      : `<span class="hint">${Math.max(0, s.atKm - j.progressKm).toFixed(1)} km 后</span>`;
    ul.appendChild(li);
  });
  $('spot-count').textContent = `${j.visitedSpots.length} / ${(j.spots || []).length}`;
}

/* ------------------------------------------------------------------ 成就 */
function renderAchievements() {
  const st = S.state;
  const list = st.achievements || [];
  const grid = $('achv-grid');
  grid.innerHTML = '';
  list.forEach((a) => {
    const li = document.createElement('li');
    li.className = 'achv-row' + (a.unlocked ? '' : ' locked');
    li.innerHTML = `
      <div><span class="achv-name"></span><span class="achv-desc"></span></div>
      <div class="achv-val"></div>
      <div class="achv-bar"><i></i></div>`;
    li.querySelector('.achv-name').textContent = a.name;
    li.querySelector('.achv-desc').textContent = a.desc;
    li.querySelector('.achv-bar i').style.width = `${Math.round(a.progress * 100)}%`;
    li.querySelector('.achv-val').textContent = a.unlocked ? '已解锁' : `${Math.round(a.progress * 100)}%`;
    grid.appendChild(li);
  });
  renderPageHead();

  const track = $('mount-track');
  track.innerHTML = '';
  const cur = st.mount;
  (st.mounts || []).forEach((m) => {
    const on = meters(st.totals.meters) >= m.minMeters;
    const d = document.createElement('div');
    d.className = 'mount-step' + (on ? ' on' : '') + (cur && cur.id === m.id ? ' cur' : '');
    d.innerHTML = `<div class="mi">${Icons.mountIcon(m.id, 20)}</div><div class="mn"></div><div class="md num"></div>`;
    d.querySelector('.mn').textContent = m.name;
    d.querySelector('.md').textContent = m.minMeters >= 1000 ? `${m.minMeters / 1000} km` : `${m.minMeters} m`;
    track.appendChild(d);
  });
  $('mount-current-hint').textContent = cur && cur.next
    ? `当前 ${cur.name} · 距${cur.next.name}还差 ${Fmt.formatDistance(Math.max(0, cur.next.minMeters - st.totals.meters))}`
    : `当前 ${cur ? cur.name : '步行'}`;

  // 数据总览
  const unlockedCount = (st.achievements || []).filter((a) => a.unlocked).length;
  $('ov-total').textContent = Fmt.formatDistance(st.totals.meters);
  $('ov-moves').textContent = (st.totals.moves || 0).toLocaleString();
  $('ov-streak').textContent = `${(st.metrics && st.metrics.streakDays) || 0} 天`;
  $('ov-best').textContent = Fmt.formatDistance((st.metrics && st.metrics.bestDayMeters) || 0);
  $('ov-active').textContent = Fmt.formatDuration(st.totals.activeMs);
  $('ov-today').textContent = Fmt.formatDistance(st.today.meters);
  $('ov-achv').textContent = `${unlockedCount} / ${(st.achievements || []).length}`;
  $('ov-journeys').textContent = `${(st.journeyLog || []).length} 段`;

  const log = $('journey-log');
  log.innerHTML = '';
  const logs = st.journeyLog || [];
  if (!logs.length) {
    log.innerHTML = '<li class="empty">还没有完成的旅程</li>';
  } else {
    logs.slice(0, 4).forEach((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = r.name;
      const meta = document.createElement('span');
      meta.className = 'log-meta';
      meta.textContent = `${r.totalKm} km · 途经 ${r.spots} 个景点 · ${new Date(r.finishedAt).toLocaleDateString()}`;
      li.append(name, meta);
      log.appendChild(li);
    });
    if (logs.length > 4) {
      const more = document.createElement('li');
      more.className = 'log-more';
      more.textContent = `共 ${logs.length} 段旅程，仅显示最近 4 段`;
      log.appendChild(more);
    }
  }
}

/* ------------------------------------------------------------------ 设置 */
function fillSettings() {
  if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const s = S.state.settings;
  const st = S.state;

  $('cal-mode').value = s.calibration.mode;
  $('cal-inch').value = s.calibration.diagonalInch;
  $('cal-manual').value = s.calibration.manualCmPerPoint || '';
  $('cal-factor').value = s.calibration.factor;
  $('cal-factor-val').textContent = Number(s.calibration.factor).toFixed(2);
  $('field-manual').style.display = s.calibration.mode === 'manual' ? '' : 'none';
  // manual 模式下微调系数不参与换算，禁用滑块避免「拖了没反应」
  $('cal-factor').disabled = s.calibration.mode === 'manual';

  const dl = $('display-list');
  dl.innerHTML = '';
  (st.displays || []).forEach((d) => {
    const item = document.createElement('div');
    item.className = 'display-item';
    item.innerHTML = `
      <div class="dt"></div>
      <div class="df"><label for="disp-${d.id}">对角线(英寸)</label><input id="disp-${d.id}" type="number" min="5" max="100" step="0.5" /><button class="btn ghost sm">应用</button></div>
      <div class="dm"></div>`;
    item.querySelector('.dt').textContent = `${d.label}（${d.widthCm} × ${d.heightCm} cm）`;
    item.querySelector('.dm').textContent =
      `${d.sizeDip.width}×${d.sizeDip.height} pt · ${d.physicalPx.width}×${d.physicalPx.height} @${d.scaleFactor}x · ${d.ppi} PPI · 1 pt = ${(d.cmPerPoint * 10).toFixed(3)} mm · 横扫全屏 ≈ ${d.sweepCm} cm`;
    const input = item.querySelector('input');
    input.value = d.diagonalInch;
    item.querySelector('button').addEventListener('click', () => {
      const per = { ...(S.state.settings.calibration.perDisplay || {}) };
      per[d.id] = Number(input.value) || d.diagonalInch;
      api.updateSettings({ calibration: { perDisplay: per } }).then(applyFull);
    });
    dl.appendChild(item);
  });

  $('cal-hint').textContent = (st.displays || []).length
    ? `检测到 ${st.displays.length} 台显示器 · 1 pt ≈ ${((st.displays[0].cmPerPoint) * 10).toFixed(3)} mm`
    : '—';

  $('set-interval').value = s.sampling.intervalMs;
  $('set-deadzone').value = s.sampling.deadZonePx;
  $('set-maxjump').value = s.sampling.maxJumpRatio;
  $('set-crossscreen').checked = !!s.sampling.crossScreenSkip;

  $('health-enabled').checked = !!s.health.enabled;
  $('health-threshold').value = s.health.thresholdMin;
  $('health-snooze').value = s.health.snoozeMin;
  $('health-idle').value = s.health.idleResetSec;
  $('health-title').value = s.health.title;
  $('health-message').value = s.health.message;
  $('health-notify').checked = !!s.health.useNotification;

  $('float-opacity').value = Math.round((s.float.opacity || 1) * 100);
  $('float-opacity-val').textContent = `${Math.round((s.float.opacity || 1) * 100)}%`;
  $('float-level').value = s.float.alwaysOnTopLevel;
  $('float-visible').checked = !!s.float.visible;
  $('float-route').checked = s.float.showRoute !== false;

  $('gen-login').checked = !!s.general.launchAtLogin;
  $('gen-tray').checked = !!s.general.closeToTray;

  $('store-dir').textContent = st.dataDir || '—';
  $('store-size').textContent = Fmt.formatBytes(st.storeBytes || 0);
  $('store-calibrated').textContent = st.calibratedAt
    ? new Date(st.calibratedAt).toLocaleDateString()
    : '未校准';

  $('set-km-per-meter').value = s.journey.kmPerMeter;
  document.querySelector(`input[name="jmode"][value="${s.journey.mode}"]`).checked = true;
  const sel = $('route-select');
  sel.innerHTML = '';
  (st.routes || []).forEach((r) => {
    const op = document.createElement('option');
    op.value = r.id;
    op.textContent = r.name;
    sel.appendChild(op);
  });
  sel.value = s.journey.routeId;
  sel.disabled = s.journey.mode !== 'fixed';

  S.settingsFilled = true;
}

function bindSettings() {
  const set = (patch) => api.updateSettings(patch).then(applyFull);
  const num = (id, fn) => {
    const el = $(id);
    el.addEventListener('change', () => {
      const v = Number(el.value);
      if (!Number.isFinite(v)) return;
      fn(v);
    });
  };

  $('cal-mode').addEventListener('change', () => set({ calibration: { mode: $('cal-mode').value } }));
  num('cal-inch', (v) => set({ calibration: { diagonalInch: v } }));
  num('cal-manual', (v) => set({ calibration: { manualCmPerPoint: v } }));
  $('cal-factor').addEventListener('input', () => {
    $('cal-factor-val').textContent = Number($('cal-factor').value).toFixed(2);
  });
  $('cal-factor').addEventListener('change', () => set({ calibration: { factor: Number($('cal-factor').value) } }));

  num('set-interval', (v) => set({ sampling: { intervalMs: v } }));
  num('set-deadzone', (v) => set({ sampling: { deadZonePx: v } }));
  num('set-maxjump', (v) => set({ sampling: { maxJumpRatio: v } }));
  $('set-crossscreen').addEventListener('change', () => set({ sampling: { crossScreenSkip: $('set-crossscreen').checked } }));

  $('health-enabled').addEventListener('change', () => set({ health: { enabled: $('health-enabled').checked } }));
  num('health-threshold', (v) => set({ health: { thresholdMin: v } }));
  num('health-snooze', (v) => set({ health: { snoozeMin: v } }));
  num('health-idle', (v) => set({ health: { idleResetSec: v } }));
  $('health-title').addEventListener('change', () => set({ health: { title: $('health-title').value } }));
  $('health-message').addEventListener('change', () => set({ health: { message: $('health-message').value } }));
  $('health-notify').addEventListener('change', () => set({ health: { useNotification: $('health-notify').checked } }));
  $('btn-test-reminder').addEventListener('click', () => api.testReminder());

  $('float-opacity').addEventListener('input', () => {
    $('float-opacity-val').textContent = `${$('float-opacity').value}%`;
    api.setOpacity(Number($('float-opacity').value) / 100);
  });
  $('float-opacity').addEventListener('change', () => set({ float: { opacity: Number($('float-opacity').value) / 100 } }));
  $('float-level').addEventListener('change', () => set({ float: { alwaysOnTopLevel: $('float-level').value } }));
  $('float-visible').addEventListener('change', () => set({ float: { visible: $('float-visible').checked } }));
  $('float-route').addEventListener('change', () => set({ float: { showRoute: $('float-route').checked } }));

  $('gen-login').addEventListener('change', () => set({ general: { launchAtLogin: $('gen-login').checked } }));
  $('gen-tray').addEventListener('change', () => set({ general: { closeToTray: $('gen-tray').checked } }));

  $('side-pause').addEventListener('change', () => api.pause($('side-pause').checked).then(() => {
    S.state.paused = $('side-pause').checked;
    renderSidebar();
  }));

  $('btn-open-folder').addEventListener('click', () => api.openFolder());
  $('btn-reset-day').addEventListener('click', () => {
    if (confirm('确定要清空今日的里程、次数与活跃时长，并重新掷一条路线吗？')) api.resetDay().then(applyFull);
  });

  // 导出
  $('btn-export-csv').addEventListener('click', async () => {
    const r = await api.exportData({ format: 'csv' });
    if (r.ok) toast('download', '已导出 CSV', r.path);
  });
  $('btn-export-json').addEventListener('click', async () => {
    const r = await api.exportData({ format: 'json' });
    if (r.ok) toast('download', '已导出 JSON', r.path);
  });

  // 首次校准引导
  $('cal-banner-ok').addEventListener('click', async () => {
    localStorage.removeItem(CAL_SKIP_KEY);
    await api.calibrationDone();
    $('cal-banner').hidden = true;
    toast('check', '校准完成', '之后可随时在设置页调整对角线或微调系数');
  });
  $('cal-banner-skip').addEventListener('click', () => {
    localStorage.setItem(CAL_SKIP_KEY, String(Date.now()));
    $('cal-banner').hidden = true;
  });

  $('btn-reroll').addEventListener('click', () => api.reroll().then(applyFull));
  $('route-select').addEventListener('change', () => api.setJourneyMode('fixed', $('route-select').value).then(applyFull));
  document.querySelectorAll('input[name="jmode"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) api.setJourneyMode(r.value, $('route-select').value).then(applyFull);
    });
  });
  num('set-km-per-meter', (v) => set({ journey: { kmPerMeter: v } }));
}

/* ------------------------------------------------------------------ 交互 */
function switchTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${tab}`));
  $('topbar-title').textContent = NAV_LABELS[tab] || '';
  $('nav-sheet').classList.remove('open');
  renderPageHead();
  if (tab === 'stats') requestAnimationFrame(renderStats);
  if (tab === 'journey') requestAnimationFrame(() => { renderJourney(); drawMap($('map-main'), $('map-marker-main'), false); });
  if (tab === 'today') requestAnimationFrame(() => { renderToday(); drawMap($('map-today'), $('map-marker'), true); drawScenery(); });
  if (tab === 'achv') requestAnimationFrame(renderAchievements);
}

function bindNav() {
  $('nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (btn) switchTab(btn.dataset.tab);
  });
  $('menu-btn').addEventListener('click', () => $('nav-sheet').classList.add('open'));
  $('sheet-close').addEventListener('click', () => $('nav-sheet').classList.remove('open'));
}

function applyFull(state) {
  if (state) S.state = state;
  if (S.state.needsCalibration && !calSkipActive()) $('cal-banner').hidden = false;
  renderAll();
}

/** 「暂不」跳过校准引导：7 天内不再弹（跨天/改设置触发的 state:full 不会重新打扰） */
const CAL_SKIP_KEY = 'mj-cal-skip-ts';
function calSkipActive() {
  const ts = Number(localStorage.getItem(CAL_SKIP_KEY) || 0);
  return ts > 0 && Date.now() - ts < 7 * 86400000;
}

function renderAll() {
  renderSidebar();
  renderToday();
  renderStats();
  renderJourney();
  renderAchievements();
  fillSettings();
  drawMap($('map-today'), $('map-marker'), true);
  drawMap($('map-main'), $('map-marker-main'), false);
  drawScenery();
}

/* ------------------------------------------------------------------ 事件 */
function onUpdate(u) {
  const s = S.state;
  s.today = u.today;
  s.totals = u.totals;
  s.journey = u.journey;
  s.mount = u.mount;
  s.paused = u.paused;
  s.continuousMs = u.continuousMs;
  s.track = u.track;
  s.screenLayout = u.screenLayout || s.screenLayout;
  renderSidebar();
  renderToday();
  if ($('tab-journey').classList.contains('active')) { renderJourney(); drawMap($('map-main'), $('map-marker-main'), false); }
  if ($('tab-today').classList.contains('active')) drawMap($('map-today'), $('map-marker'), true);
  if ($('tab-stats').classList.contains('active')) renderStats();
  if ($('tab-achv').classList.contains('active')) renderAchievements();
}

function onJourneyEvent(ev) {
  if (ev.type === 'spot') {
    modal('pin', `恭喜你抵达${ev.payload.name}`, `${ev.payload.city} · ${ev.payload.intro}`);
    toast('pin', `抵达 ${ev.payload.name}`, ev.payload.intro);
  } else if (ev.type === 'city') {
    toast('flag', `抵达 ${ev.payload.name}`, `已完成 ${ev.payload.km} km`);
  } else if (ev.type === 'complete') {
    modal('flag', `旅程达成：${ev.payload.routeName}`, `你走完了全程 ${ev.payload.totalKm} 公里，下一趟旅程已就绪。`);
  }
}

function onAchievement(a) {
  toast('medal', `成就解锁 · ${a.name}`, a.desc, 7000);
}

function onReminder(r) {
  toast('bell', r.title, r.message, 12000);
}

function onBoostEvent(e) {
  if (e && e.type === 'whipEnd') {
    toast('flag', `${e.label || '冲刺'}结束`, `这一轮跑了 +${(e.gainedKm || 0).toFixed(1)} km`);
  }
}

/* ------------------------------------------------------------------ 启动 */
async function init() {
  // 静态图标注入
  $('brand-mark').innerHTML = Icons.svg('brand', 22);
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.querySelector('.nav-ic').innerHTML = Icons.svg(NAV_ICONS[b.dataset.tab], 16);
  });
  $('menu-btn').innerHTML = Icons.svg('menu', 18);
  $('sheet-close').innerHTML = Icons.svg('close', 18);
  // 手机端抽屉里的导航（从侧栏复制）
  const sheetList = $('nav-sheet-list');
  document.querySelectorAll('#nav .nav-item').forEach((b) => {
    const c = b.cloneNode(true);
    sheetList.appendChild(c);
  });

  S.state = await api.getState();
  bindNav();
  bindSettings();
  bindStatsRange();
  renderAll();

  api.on('state:update', onUpdate);
  api.on('state:full', applyFull);
  api.on('journey:event', onJourneyEvent);
  api.on('achievement', onAchievement);
  api.on('health:reminder', onReminder);
  api.on('boost:event', onBoostEvent);

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderStats();
      renderToday();
      drawMap($('map-main'), $('map-marker-main'), false);
      drawMap($('map-today'), $('map-marker'), true);
      drawScenery();
    }, 120);
  });

  const acc = await api.accessibility();
  const note = $('platform-note');
  if (acc.platform === 'darwin') {
    note.innerHTML = 'macOS：读取光标坐标<b>不需要</b>辅助功能权限（本应用使用 screen.getCursorScreenPoint）。' +
      '当前权限状态：' + (acc.trusted ? '已授权' : '未授权（不影响本应用）') +
      '。若打包为正式发行版，建议对 dmg 做开发者签名与公证，否则 Gatekeeper 会拦截首次启动。';
  } else if (acc.platform === 'win32') {
    note.innerHTML = 'Windows：无需特殊权限。若开启了 125%/150% 缩放，本应用仍按逻辑分辨率换算，' +
      '物理距离不受影响（详见校准说明）。';
  } else {
    note.textContent = 'Linux：透明悬浮窗依赖桌面合成器，若窗口背景不透明请改用非透明模式。';
  }
}

init();
