'use strict';

/* global api, Geo, Fmt, MapKit, SceneryKit, HeatMap, Charts, Icons, FX */

const $ = (id) => document.getElementById(id);
const S = {
  state: null, settingsFilled: false, statsRange: 'week', chartData: [], tableExpanded: false, tab: 'today', speed: null,
  ride: { shownKm: 0, camRoll: 0, lastInfo: null, lastDraw: 0 } // 路上视角：进度补间 / 相机侧倾 / 上一帧弯道信息
};

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

/** toast；celebrate = 庆祝变体（图标弹跳 + 数据色环，配 FX 彩带）；
 *  goTab = 可点击跳转的目标页（如 achv/journey/today），构成「事件 → 对应页面」导航闭环 */
function toast(icon, title, body, ms, celebrate, goTab) {
  const el = document.createElement('div');
  el.className = 'toast' + (celebrate ? ' celebrate' : '') + (goTab ? ' link' : '');
  el.innerHTML = `<div class="ti">${Icons.svg(icon || 'dot', 16)}</div><div><div class="tt"></div><div class="tb"></div></div>`;
  el.querySelector('.tt').textContent = title;
  el.querySelector('.tb').textContent = body || '';
  if (goTab) {
    el.title = '点击查看详情';
    const go = document.createElement('span');
    go.className = 'tgo';
    go.innerHTML = Icons.svg('chevron', 12);
    go.style.transform = 'rotate(-90deg)';
    el.appendChild(go);
    el.addEventListener('click', () => {
      switchTab(goTab);
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    });
  }
  $('toast-stack').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, ms || 5000);
  return el;
}

function modal(glyph, title, body, celebrate, goTab) {
  $('modal-glyph').innerHTML = Icons.svg(glyph || 'pin', 28);
  $('modal-title').textContent = title;
  $('modal-body').textContent = body || '';
  $('modal-card').classList.toggle('celebrate', !!celebrate);
  let go = $('modal-go');
  if (goTab) {
    if (!go) {
      go = document.createElement('button');
      go.id = 'modal-go';
      go.className = 'btn ghost';
      go.addEventListener('click', () => { hideModal(); switchTab(go.dataset.tab); });
      $('modal-ok').before(go);
    }
    go.dataset.tab = goTab;
    go.textContent = goTab === 'journey' ? '查看路线' : goTab === 'achv' ? '查看演进' : '查看详情';
    go.hidden = false;
  } else if (go) {
    go.hidden = true;
  }
  $('modal').classList.add('show');
}
function hideModal() {
  $('modal').classList.remove('show');
  $('modal-card').classList.remove('celebrate');
}
$('modal-ok').addEventListener('click', hideModal);
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) hideModal();
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

/** 第一人称「在路上」视角：镜头贴着路面往前看，纵深由真实路线几何算出。
 *  玩法表现层与悬浮窗同源：进度补间、相机侧倾（压弯/冲刺）、幽灵车、速度线。 */
function drawScenery() {
  const st = S.state;
  const j = st.journey;
  if (!j || !j.points) return;
  const kmAhead = nextCityKm(j);
  const nextCity = j.nextCity && kmAhead != null
    ? { name: j.nextCity.name, lon: j.nextCity.lon, lat: j.nextCity.lat, kmAhead }
    : null;
  const b = j.boost;
  const whipOn = !!(b && b.whipRemainS > 0);
  const ghost = (st.ghost && st.ghost.have)
    ? { aheadKm: (st.ghost.meters - st.today.meters) / 1000 }
    : null;
  S.ride.lastInfo = SceneryKit.render($('scene-today'), {
    route: { points: j.points, cum: j.cum, totalKm: j.totalKm, spots: j.spots },
    progressKm: S.ride.shownKm,
    visitedSpots: j.visitedSpots,
    nextCity,
    compact: false,
    roll: S.ride.camRoll,
    boost: { whip: whipOn },
    ghost
  });
}

/** 路上视角动画循环：进度补间 + 相机侧倾平滑。只在今日页且页面可见时作画，
 *  其余时刻空转（Canvas 位图在 display:none 时也不会膨胀）。 */
function rideLoop(ts) {
  requestAnimationFrame(rideLoop);
  const st = S.state;
  const j = st && st.journey;
  if (!j || !j.points) return;
  if (S.tab !== 'today' || document.hidden) return;

  // 主进程 2Hz 推送，这里补间，避免画面跳帧（与悬浮窗同一手感）
  S.ride.shownKm += (j.progressKm - S.ride.shownKm) * 0.18;
  if (Math.abs(j.progressKm - S.ride.shownKm) < 0.01) S.ride.shownKm = j.progressKm;

  // 相机侧倾目标：压弯向弯内倾 + 冲刺轻微抖动（弯向取上一帧渲染信息）
  const b = j.boost;
  const whipOn = !!(b && b.whipRemainS > 0);
  const bendDir = S.ride.lastInfo ? S.ride.lastInfo.bendDir : 0;
  const rollTarget = (b && b.leanActive && bendDir ? bendDir * 0.05 : 0)
    + (whipOn ? Math.sin(ts / 90) * 0.006 : 0);
  S.ride.camRoll += (rollTarget - S.ride.camRoll) * 0.12;

  if (ts - S.ride.lastDraw < 40) return; // ~25fps，与悬浮窗一致，够顺滑且省电
  S.ride.lastDraw = ts;
  drawScenery();
}

/** 玩法叠层：能量槽 / 抽鞭按钮 / 倍率徽章（与悬浮窗同一份 boost 快照） */
function renderRide() {
  const st = S.state;
  const j = st.journey;
  if (!j) return;
  const b = j.boost;
  const e = b ? Math.max(0, Math.min(1, b.energy)) : 0;
  const whipOn = !!(b && b.whipRemainS > 0);
  const label = b && b.whipLabel ? b.whipLabel : '冲刺';

  const row = $('ride-boost');
  row.classList.toggle('whip', whipOn);
  row.classList.toggle('ready', !whipOn && e >= 1);
  $('ride-boost-bar').style.width = whipOn
    ? `${Math.min(100, (b.whipRemainS / 15) * 100)}%`
    : `${Math.round(e * 100)}%`;

  const btn = $('btn-whip');
  btn.classList.toggle('whip', whipOn);
  btn.classList.toggle('ready', !whipOn && e >= 1);
  $('whip-label').textContent = whipOn
    ? `${label}中 · ${b.whipRemainS}s`
    : (e >= 1 ? `点击${label}！` : `${label} · ${Math.round(e * 100)}%`);

  const ic = $('whip-ic');
  if (ic.dataset.mount !== st.mount.id) {
    ic.dataset.mount = st.mount.id;
    ic.innerHTML = Icons.mountIcon(st.mount.id, 14);
  }

  const m = $('scene-mult');
  if (b && b.gameMult > 1) {
    m.hidden = false;
    m.textContent = `×${b.gameMult} ${whipOn ? label : '压弯中'}`;
  } else {
    m.hidden = true;
  }
}

/** 抽鞭冲刺（主窗口也能玩）：能量满 → 冲刺；不足 → 拒绝抖动 */
async function onWhip() {
  const r = await api.whip();
  const btn = $('btn-whip');
  btn.classList.remove('deny');
  void btn.offsetWidth; // 重启动画
  if (r && r.ok === false) btn.classList.add('deny');
  else renderRide();
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
    const h = Math.round((d.meters / max) * TOP);
    const x = i * (BW + GAP);
    // 与统计图表同语言：单序列全数据色、0 值诚实不画；今天的辨识交给标签（数据色 + 加重）
    if (d.meters > 0) marks += `<rect x="${x.toFixed(1)}" y="${(TOP - h).toFixed(1)}" width="${BW.toFixed(1)}" height="${h}" fill="#1d5fbf"></rect>`;
    const dow = new Date(`${d.key}T00:00:00`).getDay();
    const isToday = d.key === todayKey;
    marks += `<text x="${(x + BW / 2).toFixed(1)}" y="72" text-anchor="middle" font-size="11" fill="${isToday ? '#1d5fbf' : '#8a8f99'}" font-weight="${isToday ? '600' : '400'}">${dowChar[dow]}</text>`;
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

/** 今日目标达成日历：最近 14 天小方格（含今天）。
 *  达成判定从 rawDays 的当日距离推导（目标可能调整过，按当前目标口径统一回看）；
 *  空状态/关闭目标时整块隐藏。HTMLElement 的 .hidden 正常生效（非 SVG）。 */
function renderGoalDays() {
  const host = $('goal-days');
  if (!host) return;
  const st = S.state;
  const g = st.settings && st.settings.goal;
  if (!g || !g.enabled || !(g.dailyKm > 0)) { host.hidden = true; return; }
  const goalM = g.dailyKm * 1000;
  const days = st.rawDays || {};
  const todayKey = Fmt.dayKey(Date.now());
  host.hidden = false;
  host.innerHTML = '';
  for (let i = 13; i >= 0; i--) {
    const t = Date.now() - i * 86400000;
    const key = Fmt.dayKey(t);
    const meters = key === todayKey ? st.today.meters : ((days[key] && days[key].distanceCm) || 0) / 100;
    const done = meters >= goalM;
    const el = document.createElement('i');
    el.className = 'gd' + (done ? ' done' : '') + (i === 0 ? ' today' : '');
    el.title = `${key.slice(5)} · ${done ? '已达成' : '未达成'} · ${Fmt.formatDistance(meters)}`;
    host.appendChild(el);
  }
}

/** 今日目标进度环（KPI 卡右上角，关闭/无目标时隐藏）。
 *  注意 goal-ring 是 SVG 元素：.hidden 属性不会映射到 attribute，须用 removeAttribute/setAttribute。 */
function updateGoal() {
  const st = S.state;
  const wrap = $('goal-ring');
  const g = st.settings && st.settings.goal;
  if (!g || !g.enabled || !(g.dailyKm > 0)) { wrap.setAttribute('hidden', ''); return; }
  const goalM = g.dailyKm * 1000;
  const p = Math.max(0, Math.min(1, st.today.meters / goalM));
  wrap.removeAttribute('hidden');
  wrap.classList.toggle('done', p >= 1);
  $('goal-ring-fg').style.strokeDashoffset = (97.4 * (1 - p)).toFixed(1);
  $('goal-ring-txt').textContent = `${Math.round(p * 100)}%`;
  wrap.setAttribute('title', `今日目标 ${g.dailyKm} km · 已完成 ${Math.round(p * 100)}%`
    + (p >= 1 ? ' · 达成！' : ` · 还差 ${Fmt.formatDistance(Math.max(0, goalM - st.today.meters))}`));
}

/** 热力卡热点摘要徽标：最活跃屏幕（≥2 屏才有意义）/ 最集中时段（todayIntraday 小时增量）。
 *  复用统计页洞察徽标样式；数据色只给显著信号（份额 ≥60% / ≥30%）。 */
function renderHeatInsights() {
  const host = $('heat-insights');
  if (!host) return;
  const st = S.state;
  host.innerHTML = '';
  const track = st.track || [];
  if (!track.length) return;

  const chip = (icon, text, cls) => {
    const el = document.createElement('span');
    el.className = 'sight' + (cls ? ` ${cls}` : '');
    el.innerHTML = Icons.svg(icon, 13);
    el.appendChild(document.createTextNode(text));
    return el;
  };

  // 最活跃屏幕：轨迹点按显示器 id 聚类
  const displays = (st.screenLayout && st.screenLayout.displays) || [];
  if (displays.length > 1) {
    const byD = {};
    for (const p of track) byD[p.d] = (byD[p.d] || 0) + 1;
    const top = Object.entries(byD).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) {
      const d = displays.find((x) => String(x.id) === String(top[0]));
      const tag = d ? (d.primary ? '主屏' : (d.internal ? '内建屏' : `屏幕 #${d.id}`)) : `屏幕 ${top[0]}`;
      const pct = Math.round((top[1] / track.length) * 100);
      host.appendChild(chip('screen', `最活跃在${tag} ${pct}%`, pct >= 60 ? 'hot' : ''));
    }
  }

  // 最集中时段：今天的分钟级累计曲线按小时求增量（轨迹点无时间戳，时段从这里推导）
  const intraday = st.todayIntraday;
  if (Array.isArray(intraday) && intraday.length) {
    const hours = new Array(24).fill(0);
    let lastVal = 0;
    for (let m = 0; m < 1440; m++) {
      const v = intraday[m];
      if (v == null) continue;
      hours[Math.floor(m / 60)] += Math.max(0, (v - lastVal) / 100);
      lastVal = v;
    }
    const total = hours.reduce((a, b) => a + b, 0);
    if (total > 0) {
      let hi = 0;
      for (let i = 1; i < 24; i++) if (hours[i] > hours[hi]) hi = i;
      const pct = Math.round((hours[hi] / total) * 100);
      const hh = (n) => String(n % 24).padStart(2, '0');
      host.appendChild(chip('clock', `高峰 ${hh(hi)}–${hh(hi + 1)} 时 ${pct}%`, pct >= 30 ? 'hot' : ''));
    }
  }
}

function renderToday() {
  const st = S.state;
  $('today-distance').textContent = Fmt.formatDistance(st.today.meters);
  $('today-moves').textContent = st.today.moves.toLocaleString();
  $('today-active').textContent = Fmt.formatDuration(st.today.activeMs);
  updateGoal();
  renderGoalDays();

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
  renderRide();

  // 下一个里程碑（≥80% 点亮数据色，接近达成的信号语言）
  const next = (st.achievements || []).filter((a) => a.type === 'distance' && !a.unlocked).sort((a, b) => a.value - b.value)[0];
  const sn = $('side-next');
  if (next) {
    $('milestone-badge').textContent = next.name;
    $('milestone-bar').style.width = `${Math.round(next.progress * 100)}%`;
    $('milestone-text').textContent = `${Fmt.formatDistance(st.totals.meters)} / ${Fmt.formatDistance(next.value)} · ${next.desc}`;
    sn.classList.toggle('near', next.progress >= 0.8);
  } else {
    $('milestone-badge').textContent = '全部达成';
    $('milestone-bar').style.width = '100%';
    $('milestone-text').textContent = `累计 ${Fmt.formatDistance(st.totals.meters)}，所有里程成就已解锁`;
    sn.classList.remove('near');
  }

  // 本周条带
  renderWeekStrip();

  // 热力图
  const heatPts = st.track || [];
  $('heat-hint').textContent = heatPts.length ? `${heatPts.length} 个采样点` : '等待数据';
  renderHeatInsights();
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

/** 洞察区间的当前键集与对比键集（各区间用自己的同比口径，月对齐到「上月同期」日数） */
function insightRange(range) {
  const today = new Date();
  const monday = today.getTime() - ((today.getDay() + 6) % 7) * 86400000;
  if (range === 'lastweek') {
    return {
      cur: Fmt.currentWeekDays(monday - 7 * 86400000),
      prev: Fmt.currentWeekDays(monday - 14 * 86400000),
      name: '上周', prevName: '前一周'
    };
  }
  if (range === 'month') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const dayN = today.getDate();                       // 本月已过天数（含今天）
    const dimPrev = new Date(y, m, 0).getDate();        // 上月总天数
    const n = Math.min(dayN, dimPrev);                  // 同比口径：同期日数对齐
    const cur = [...Array(dayN).keys()].map((i) => Fmt.dayKey(new Date(y, m, 1 + i).getTime()));
    const prev = [...Array(n).keys()].map((i) => Fmt.dayKey(new Date(y, m - 1, 1 + i).getTime()));
    return { cur, prev, name: '本月', prevName: '上月同期' };
  }
  if (range === '14') {
    return {
      cur: Fmt.lastNDays(14),
      prev: Fmt.lastNDays(14, today.getTime() - 14 * 86400000),
      name: '近 14 天', prevName: '前 14 天'
    };
  }
  return {
    cur: Fmt.currentWeekDays(),
    prev: Fmt.currentWeekDays(monday - 7 * 86400000),
    name: '本周', prevName: '上周'
  };
}

/** 游戏化洞察徽标（随所选区间联动）：同比 ±% / 连续记录天数 / 区间内最佳单日。
 *  数据型游戏化，唯一数据色给正向信号。 */
function renderInsights() {
  const host = $('stat-insights');
  if (!host) return;
  const st = S.state;
  const days = st.rawDays || {};
  const metersOf = (k) => ((days[k] && days[k].distanceCm) || 0) / 100;
  const sum = (keys) => keys.reduce((a, k) => a + metersOf(k), 0);
  const R = insightRange(S.statsRange);
  const cur = sum(R.cur);
  const prev = sum(R.prev);

  const chip = (icon, text, cls) => {
    const el = document.createElement('span');
    el.className = 'sight' + (cls ? ` ${cls}` : '');
    el.innerHTML = Icons.svg(icon, 13);
    el.appendChild(document.createTextNode(text));
    return el;
  };
  host.innerHTML = '';
  if (cur > 0 || prev > 0) {
    if (prev > 0) {
      const pct = Math.round(((cur - prev) / prev) * 100);
      host.appendChild(chip('stats', `${R.name}较${R.prevName} ${pct >= 0 ? '+' : ''}${pct}%`, pct > 0 ? 'up' : ''));
    } else {
      host.appendChild(chip('stats', `${R.prevName}无记录，${R.name}从零开始`));
    }
  }
  const streak = (st.metrics && st.metrics.streakDays) || 0;
  if (streak > 0) host.appendChild(chip('flame', `连续记录 ${streak} 天`, streak >= 2 ? 'hot' : ''));
  let bestK = null;
  for (const k of R.cur) {
    if (metersOf(k) > 0 && (bestK == null || metersOf(k) > metersOf(bestK))) bestK = k;
  }
  if (bestK) {
    host.appendChild(chip('trophy', `最佳单日 ${bestK.slice(5)} · ${Fmt.formatDistance(metersOf(bestK))}`));
  } else {
    const best = (st.metrics && st.metrics.bestDayMeters) || 0;
    if (best > 0) host.appendChild(chip('trophy', `历史最佳 ${Fmt.formatDistance(best)}`));
  }
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
  renderInsights();
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
    // 前三名名次徽标：第一名数据色，二三名深浅灰
    const rank = i < 3 ? `<span class="rk rk-${i + 1}">${i + 1}</span>` : `${i + 1}`;
    tr.innerHTML = `<td class="rank">${rank}</td><td>${d.key}</td><td>${Fmt.weekdayLabel(d.key)}</td><td class="num">${Fmt.formatDistance(d.meters)}</td><td class="num">${d.moves.toLocaleString()}</td><td class="num">${Fmt.formatDuration(d.activeMs)}</td>`;
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
  const spots = j.spots || [];
  if (!spots.length) {
    const li = document.createElement('li');
    li.className = 'spot-empty';
    li.textContent = '本条路线没有预设景点';
    ul.appendChild(li);
  } else {
    /* 时间轴打卡：节点（已抵达=实心数据色✓ / 下一站=数据色空心环 / 未到=灰环）
       + 连线（走过的段 = 数据色）+ 「你在这里」游标（坐骑图标，呼应地图标记） */
    let nowPlaced = false;
    let seenVisited = false;
    let nextAssigned = false;
    const appendNow = () => {
      const li = document.createElement('li');
      li.className = 'spot-now' + (seenVisited ? ' started' : '');
      li.innerHTML = '<div class="spot-rail"><i class="now-dot"></i></div><div class="spot-body"><div class="spot-name"></div><div class="spot-meta"></div></div>';
      li.querySelector('.now-dot').innerHTML = Icons.mountIcon(st.mount.id, 12);
      li.querySelector('.spot-name').textContent = '你在这里';
      li.querySelector('.spot-meta').textContent = `已走 ${j.progressKm} km`
        + (j.nextSpot ? ` · 距${j.nextSpot.name}还差 ${Math.max(0, j.nextSpot.atKm - j.progressKm).toFixed(1)} km` : '');
      ul.appendChild(li);
      nowPlaced = true;
    };
    spots.forEach((s) => {
      if (!nowPlaced && s.atKm > j.progressKm) appendNow();
      const on = visited.has(s.id);
      if (on) seenVisited = true;
      const isNext = !on && !nextAssigned;
      if (isNext) nextAssigned = true;
      const li = document.createElement('li');
      li.className = 'spot-item' + (on ? ' on' : isNext ? ' next' : ' locked');
      li.innerHTML = `
        <div class="spot-rail"><i class="spot-dot"></i></div>
        <div class="spot-body"><div class="spot-name"></div><div class="spot-meta"></div><div class="spot-intro"></div></div>
        <div class="spot-state"></div>`;
      li.querySelector('.spot-dot').innerHTML = on ? Icons.svg('check', 9) : '';
      li.querySelector('.spot-name').textContent = s.name;
      li.querySelector('.spot-meta').textContent = `${s.city} · 第 ${s.atKm} km 处`;
      li.querySelector('.spot-intro').textContent = s.intro;
      li.querySelector('.spot-state').innerHTML = on
        ? '<span class="badge" style="color:var(--pill-positive-ink);background:var(--pill-positive-bg)">已抵达</span>'
        : `<span class="hint">${Math.max(0, s.atKm - j.progressKm).toFixed(1)} km 后</span>`;
      ul.appendChild(li);
    });
    if (!nowPlaced) appendNow();
  }
  $('spot-count').textContent = `${j.visitedSpots.length} / ${(j.spots || []).length}`;
}

/* ------------------------------------------------------------------ 成就 */
function renderAchievements() {
  const st = S.state;
  const list = st.achievements || [];
  const grid = $('achv-grid');
  grid.innerHTML = '';

  /* 分组：进行中按进度降序（最近的在最上），已解锁按档位升序；
     进度语言与里程碑卡/时间轴一致——已解锁 = 数据色，进行中 ≥80% 点亮 */
  const row = (a) => {
    const li = document.createElement('li');
    const near = !a.unlocked && a.progress >= 0.8;
    li.className = 'achv-row' + (a.unlocked ? ' unlocked' : ' locked') + (near ? ' near' : '');
    li.innerHTML = `
      <div><span class="achv-name"></span><span class="achv-desc"></span></div>
      <div class="achv-val"></div>
      <div class="achv-bar"><i></i></div>`;
    li.querySelector('.achv-name').textContent = a.name;
    li.querySelector('.achv-desc').textContent = a.desc;
    li.querySelector('.achv-bar i').style.width = `${Math.round(a.progress * 100)}%`;
    li.querySelector('.achv-val').textContent = a.unlocked ? '已解锁' : `${Math.round(a.progress * 100)}%`;
    return li;
  };
  const groupLabel = (text) => {
    const li = document.createElement('li');
    li.className = 'achv-group-label';
    li.textContent = text;
    return li;
  };
  const wip = list.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress);
  const done = list.filter((a) => a.unlocked).sort((a, b) => (a.value || 0) - (b.value || 0));
  if (wip.length) {
    grid.appendChild(groupLabel(`进行中 · ${wip.length}`));
    wip.forEach((a) => grid.appendChild(row(a)));
  }
  if (done.length) {
    grid.appendChild(groupLabel(`已解锁 · ${done.length}`));
    done.forEach((a) => grid.appendChild(row(a)));
  }
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'achv-group-label';
    li.textContent = '暂无成就';
    grid.appendChild(li);
  }
  renderPageHead();

  const track = $('mount-track');
  track.innerHTML = '';
  const cur = st.mount;
  (st.mounts || []).forEach((m, i) => {
    const on = meters(st.totals.meters) >= m.minMeters;
    // 连线着色：本节点已解锁 → 左半段数据色；下一档已解锁 → 右半段数据色
    const joined = i + 1 < st.mounts.length && meters(st.totals.meters) >= st.mounts[i + 1].minMeters;
    const d = document.createElement('div');
    d.className = 'mount-step' + (on ? ' on' : '') + (cur && cur.id === m.id ? ' cur' : '') + (joined ? ' joined' : '');
    d.innerHTML = `<div class="mi">${Icons.mountIcon(m.id, 20)}</div><div class="mn"></div><div class="md num"></div>`;
    d.querySelector('.mn').textContent = m.name;
    d.querySelector('.md').textContent = m.minMeters >= 1000 ? `${m.minMeters / 1000} km` : `${m.minMeters} m`;
    track.appendChild(d);
  });
  // 距下一档坐骑的进度条（与侧栏/路线页同一进度语言）
  const mn = $('mount-next');
  if (cur && cur.next) {
    mn.hidden = false;
    $('mount-next-bar').style.width = `${Math.round(Math.max(0, Math.min(1, cur.progress)) * 100)}%`;
    $('mount-next-text').textContent =
      `进度 ${Math.round(Math.max(0, Math.min(1, cur.progress)) * 100)}% · 距${cur.next.name}还差 ${Fmt.formatDistance(Math.max(0, cur.next.minMeters - st.totals.meters))}`;
  } else {
    mn.hidden = true;
  }
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
    // 空状态引导：给出首段旅程建议与路线页入口（导航闭环）
    const li = document.createElement('li');
    li.className = 'log-guide';
    if (st.journey) {
      li.innerHTML = `
        <div class="lg-title"></div>
        <div class="lg-sub"></div>
        <button class="btn ghost sm" id="btn-go-journey">去路线页看看</button>`;
      li.querySelector('.lg-title').textContent = '完成第一段旅程，就会记录在这里';
      li.querySelector('.lg-sub').textContent =
        `当前「${st.journey.name}」已走 ${Math.round((st.journey.percent || 0) * 100)}% · 走完全程 ${Number(st.journey.totalKm || 0).toFixed(0)} 公里即可解锁第一段旅程纪念`;
      li.querySelector('button').addEventListener('click', () => switchTab('journey'));
    } else {
      const sub = document.createElement('div');
      sub.className = 'lg-sub';
      sub.textContent = '还没有旅程数据';
      li.appendChild(sub);
    }
    log.appendChild(li);
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

  $('goal-enabled').checked = !(s.goal && s.goal.enabled === false);
  $('goal-km').value = (s.goal && s.goal.dailyKm) || 3;

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

  $('goal-enabled').addEventListener('change', () => set({ goal: { enabled: $('goal-enabled').checked } }));
  num('goal-km', (v) => set({ goal: { dailyKm: v } }));

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
  if (tab === 'today') requestAnimationFrame(() => { renderToday(); drawMap($('map-today'), $('map-marker'), true); });
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
  if (state) {
    // 换路线（reroll / 切固定路线 / 完赛开新段 / 重置今日）时进度归零：
    // 吸到新值，否则补间会把小人从上千 km 平滑「倒放」回 0（同悬浮窗）
    const routeChanged = !S.state || !S.state.journey || !state.journey
      || S.state.journey.routeId !== state.journey.routeId;
    S.state = state;
    if (routeChanged) S.ride.shownKm = state.journey ? state.journey.progressKm : 0;
  }
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
}

/* ------------------------------------------------------------------ 事件 */
/** 坐骑升级庆祝：实时更新中检测到档位跨越（id 变化且 minMeters 升高）时触发。
 *  启动首帧（prev 来自 getState）与重开窗口都不触发——只有「正在用的时候升了级」才庆祝。 */
function checkMountUpgrade(prevMount, newMount) {
  if (!prevMount || !newMount || prevMount.id === newMount.id) return;
  if ((newMount.minMeters || 0) < (prevMount.minMeters || 0)) return;
  const st = S.state;
  const next = newMount.next;
  modal('medal', `新坐骑解锁 · ${newMount.name}`,
    `累计骑行 ${Fmt.formatDistance(st.totals.meters)} · ${next
      ? `距「${next.name}」还差 ${Fmt.formatDistance(Math.max(0, next.minMeters - st.totals.meters))}`
      : '已是最高级坐骑'}`, true, 'achv');
  FX.confetti({ count: 130 });
  setTimeout(() => FX.confetti({ count: 80, spread: Math.PI * 1.3, power: 0.85 }), 200);
  const el = toast('medal', `新坐骑 · ${newMount.name}`, '点击查看坐骑演进', 7000, true, 'achv');
  FX.burstFromEl(el.querySelector('.ti'), { count: 40 });
}

/** 今日目标达成检测：仅在真实跨越目标的瞬间庆祝一次（按天持久化，重开窗口不重复） */
const GOAL_DONE_KEY = 'mj-goal-done';
function checkGoalCelebration(prevMeters, nowMeters) {
  const st = S.state;
  const g = st.settings && st.settings.goal;
  if (!g || !g.enabled || !(g.dailyKm > 0)) return;
  const goalM = g.dailyKm * 1000;
  const key = Fmt.dayKey(Date.now());
  if (localStorage.getItem(GOAL_DONE_KEY) === key) return;
  if (!(prevMeters < goalM && nowMeters >= goalM)) return;
  localStorage.setItem(GOAL_DONE_KEY, key);
  toast('flag', '今日目标达成！', `已走 ${Fmt.formatDistance(nowMeters)} · 目标 ${g.dailyKm} km`, 8000, true);
  FX.confetti({ count: 120 });
  setTimeout(() => FX.confetti({ count: 70, spread: Math.PI * 1.2, power: 0.85 }), 200);
}

function onUpdate(u) {
  const s = S.state;
  const prevMeters = s.today ? s.today.meters : 0;
  const prevMount = s.mount;
  s.today = u.today;
  s.totals = u.totals;
  s.journey = u.journey;
  s.mount = u.mount;
  s.paused = u.paused;
  s.continuousMs = u.continuousMs;
  s.track = u.track;
  s.ghost = u.ghost; // 幽灵车分钟级快照（主窗场景剪影 + 超越庆祝都要用）
  s.screenLayout = u.screenLayout || s.screenLayout;
  renderSidebar();
  renderToday();
  checkGoalCelebration(prevMeters, u.today.meters);
  checkMountUpgrade(prevMount, u.mount);
  if ($('tab-journey').classList.contains('active')) { renderJourney(); drawMap($('map-main'), $('map-marker-main'), false); }
  if ($('tab-today').classList.contains('active')) drawMap($('map-today'), $('map-marker'), true);
  if ($('tab-stats').classList.contains('active')) renderStats();
  if ($('tab-achv').classList.contains('active')) renderAchievements();
}

function onJourneyEvent(ev) {
  if (ev.type === 'spot') {
    modal('pin', `恭喜你抵达${ev.payload.name}`, `${ev.payload.city} · ${ev.payload.intro}`, true, 'journey');
    FX.confetti({ count: 110 });
    setTimeout(() => FX.confetti({ count: 60, spread: Math.PI * 1.4, power: 0.8 }), 200);
    toast('pin', `抵达 ${ev.payload.name}`, ev.payload.intro, 5000, true, 'journey');
  } else if (ev.type === 'city') {
    const el = toast('flag', `抵达 ${ev.payload.name}`, `已完成 ${ev.payload.km} km`, 5000, true, 'journey');
    FX.burstFromEl(el.querySelector('.ti'), { count: 42, spread: Math.PI });
  } else if (ev.type === 'complete') {
    modal('flag', `旅程达成：${ev.payload.routeName}`, `你走完了全程 ${ev.payload.totalKm} 公里，下一趟旅程已就绪。`, true, 'journey');
    FX.confetti({ count: 160 });
    setTimeout(() => FX.confetti({ count: 90, spread: Math.PI * 1.5, power: 0.85 }), 220);
  }
}

function onAchievement(a) {
  const el = toast('medal', `成就解锁 · ${a.name}`, a.desc, 7000, true, 'achv');
  FX.burstFromEl(el.querySelector('.ti'), { count: 90 });
}

function onReminder(r) {
  toast('bell', r.title, r.message, 12000);
}

function onBoostEvent(e) {
  if (e && e.type === 'whipEnd') {
    const el = toast('flag', `${e.label || '冲刺'}结束`, `这一轮跑了 +${(e.gainedKm || 0).toFixed(1)} km`, 5000, true, 'today');
    FX.burstFromEl(el.querySelector('.ti'), { count: 30, spread: Math.PI * 0.7, power: 0.7 });
  } else if (e && e.type === 'ghostPass') {
    // 超越昨天的自己：领先幅度取事件时刻的本地快照（幽灵此刻已在身后）
    const st = S.state;
    const lead = st && st.ghost && st.today ? Math.max(0, st.today.meters - st.ghost.meters) : 0;
    const el = toast('ghost', '胜过昨天的你', `第 ${e.total} 次超越${lead > 0 ? ` · 此刻领先 ${Fmt.formatDistance(lead)}` : ''}`, 5000, true, 'today');
    FX.burstFromEl(el.querySelector('.ti'), { count: 36, spread: Math.PI * 0.8, power: 0.75 });
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
  S.ride.shownKm = S.state.journey ? S.state.journey.progressKm : 0;
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

  // 主窗口同样能玩：点路面 = 抽鞭冲刺，叠层按钮同效；动画循环驱动路上视角
  $('scene-today').addEventListener('click', onWhip);
  $('btn-whip').addEventListener('click', onWhip);
  // 「下一个里程碑」卡 → 成就页（导航闭环）
  $('side-next').addEventListener('click', () => switchTab('achv'));
  // 「本周每日距离」条带 → 统计页（导航闭环）
  $('side-week').addEventListener('click', () => switchTab('stats'));
  // 「今日目标达成日历」→ 统计页（导航闭环）
  $('goal-days').addEventListener('click', () => switchTab('stats'));
  requestAnimationFrame(rideLoop);

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderStats();
      renderToday();
      drawMap($('map-main'), $('map-marker-main'), false);
      drawMap($('map-today'), $('map-marker'), true);
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
