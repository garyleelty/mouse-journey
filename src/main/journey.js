'use strict';

const Geo = require('../shared/geo');
const { CITY_MAP, SPOTS, FIXED_ROUTES, RANDOM_POOL } = require('./data/routes');

const SPOT_PICK_RADIUS_KM = 160; // 景点离路线超过该距离就不算「途经」
const SPOT_MIN_GAP_KM = 60;      // 相邻景点卡片的里程间隔

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 把城市名数组 → 完整路线对象（含累计里程与沿途景点） */
function buildRoute(id, name, desc, mode, cityNames) {
  const points = cityNames
    .map((n) => CITY_MAP.get(n))
    .filter(Boolean)
    .map((c) => ({ name: c.name, lon: c.lon, lat: c.lat, province: c.province }));
  if (points.length < 2) throw new Error('路线至少需要两个城市');

  const cum = Geo.cumulativeKm(points);
  const totalKm = cum[cum.length - 1];

  // 途经景点：把景点投影到路线，取距离足够近的若干
  const candidates = [];
  for (const spot of SPOTS) {
    const near = Geo.nearestOnRoute(points, cum, spot);
    if (near.distKm <= SPOT_PICK_RADIUS_KM) {
      // 离路线较远的景点若恰好投影在起点附近（< 15 km），出发即报「途经」语义不对，跳过
      if (near.distKm > 40 && near.km < 15) continue;
      candidates.push({ id: spot.id, name: spot.name, city: spot.city, lon: spot.lon, lat: spot.lat, emoji: spot.emoji, intro: spot.intro, atKm: Number(near.km.toFixed(1)), offRouteKm: Number(near.distKm.toFixed(0)) });
    }
  }
  candidates.sort((a, b) => a.atKm - b.atKm);
  const spots = [];
  for (const c of candidates) {
    if (spots.some((s) => Math.abs(s.atKm - c.atKm) < SPOT_MIN_GAP_KM)) continue;
    spots.push(c);
    if (spots.length >= 8) break;
  }

  return {
    id, name, desc, mode,
    points, cum: cum.map((v) => Number(v.toFixed(2))),
    totalKm: Number(totalKm.toFixed(1)),
    spots,
    createdAt: Date.now()
  };
}

function buildFixedRoute(routeId) {
  const def = FIXED_ROUTES.find((r) => r.id === routeId) || FIXED_ROUTES[0];
  return buildRoute(def.id, def.name, def.desc, 'fixed', def.waypoints);
}

function lerpPoint(a, b, t) {
  return { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t };
}

function buildRandomRoute(seq) {
  const pool = RANDOM_POOL.map((n) => CITY_MAP.get(n)).filter(Boolean);
  let start = pick(pool);
  let end = pick(pool);
  let guard = 0;
  while (Geo.haversineKm(start, end) < 800 && guard++ < 60) end = pick(pool);

  const midCount = 3 + Math.floor(Math.random() * 2); // 3~4 个途经城市
  const mids = [];
  let prevEndDist = Geo.haversineKm(start, end);
  for (let i = 1; i <= midCount; i++) {
    const t = i / (midCount + 1);
    const target = lerpPoint(start, end, t);
    const cand = pool
      .filter((c) => c.name !== start.name && c.name !== end.name && !mids.includes(c))
      // 单调逼近终点：每个途经点必须比上一站更接近终点，否则路线会明显折返
      .filter((c) => Geo.haversineKm(c, end) < prevEndDist - 1)
      .sort((a, b) => Geo.haversineKm(a, target) - Geo.haversineKm(b, target))[0];
    if (cand) {
      mids.push(cand);
      prevEndDist = Geo.haversineKm(cand, end);
    }
  }
  const names = [start.name, ...mids.map((c) => c.name), end.name];
  const uniq = names.filter((n, i) => i === 0 || n !== names[i - 1]);
  return buildRoute(`random-${Date.now()}`, `${start.name} → ${end.name} · 随机旅程 #${seq}`, '系统随机生成的路线，途经城市与景点随里程逐步解锁。', 'random', uniq);
}

class Journey {
  constructor(store) {
    this.store = store;
    this.seq = (store.data.journeyLog || []).length + 1;
    this.ensure();
  }

  ensure() {
    const s = this.store.settings.journey;
    let j = this.store.data.journey;
    const wantMode = s.mode || 'random';
    if (!j || !j.route || (j.route.mode === 'fixed' && wantMode === 'fixed' && j.route.id !== s.routeId)) {
      j = this._create(wantMode, s.routeId);
      this.store.data.journey = j;
      this.store.saveSoon();
    }
    this.store.data.journey = j;
    return j;
  }

  _create(mode, routeId) {
    const route = mode === 'fixed' ? buildFixedRoute(routeId) : buildRandomRoute(this.seq++);
    return {
      route,
      progressKm: 0,
      visitedSpots: [],
      cityIndex: 0,
      completed: false,
      startedAt: Date.now()
    };
  }

  /** 切换模式 / 固定路线 */
  setMode(mode, routeId) {
    this.store.data.journey = this._create(mode, routeId);
    this.store.saveSoon();
    return this.store.data.journey;
  }

  /** 重新掷一次随机路线（保留已累计里程会不公平，这里重置为 0） */
  reroll() {
    return this.setMode('random', null);
  }

  /**
   * 累加真实里程（米）
   * @returns {Array<{type:'spot'|'city'|'complete', payload:object}>}
   */
  addMeters(meters) {
    const s = this.store.settings.journey;
    const j = this.ensure();
    const events = [];
    if (!meters || meters <= 0) return events;

    j.progressKm += meters * (s.kmPerMeter || 1);
    const { route } = j;

    // 景点抵达
    if (s.showSpotCards) {
      for (const spot of route.spots) {
        if (j.progressKm >= spot.atKm && !j.visitedSpots.includes(spot.id)) {
          j.visitedSpots.push(spot.id);
          events.push({ type: 'spot', payload: spot });
        }
      }
    } else {
      // 未开启卡片时也标记为已访问，避免之后补弹一堆
      for (const spot of route.spots) {
        if (j.progressKm >= spot.atKm && !j.visitedSpots.includes(spot.id)) j.visitedSpots.push(spot.id);
      }
    }

    // 途经城市抵达（cityIndex 从 1 开始判定，起点不算；终点城市由 complete 事件报告，不重复发 city）
    while (j.cityIndex < route.points.length - 2 && j.progressKm >= route.cum[j.cityIndex + 1]) {
      j.cityIndex += 1;
      events.push({ type: 'city', payload: { ...route.points[j.cityIndex], km: route.cum[j.cityIndex] } });
    }

    // 抵达终点（只触发一次；autoNext=false 时停在终点，progressKm 不再增长，避免重复发事件/刷日志）
    if (!j.completed && j.progressKm >= route.totalKm) {
      j.completed = true;
      events.push({ type: 'complete', payload: { name: route.points[route.points.length - 1].name, routeName: route.name, totalKm: route.totalKm } });
      this.store.data.journeyLog = (this.store.data.journeyLog || []).concat([
        { name: route.name, totalKm: route.totalKm, finishedAt: Date.now(), spots: j.visitedSpots.length }
      ]).slice(-500);
      if (s.autoNext) {
        this.store.data.journey = this._create(s.mode, s.routeId);
      } else {
        j.progressKm = route.totalKm; // 停在终点
      }
    }

    this.store.saveSoon();
    return events;
  }

  snapshot() {
    const j = this.ensure();
    const { route } = j;
    const pos = Geo.pointAtKm(route.points, route.cum, j.progressKm);
    const nextSpot = route.spots.find((s) => !j.visitedSpots.includes(s.id)) || null;
    // 走完且未开启自动下一段时：不再有「下一站」，让 UI 显示「已抵达终点」
    const nextCity = j.completed
      ? null
      : route.points[Math.min(j.cityIndex + 1, route.points.length - 1)];
    return {
      routeId: route.id,
      name: route.name,
      desc: route.desc,
      mode: route.mode,
      points: route.points,
      cum: route.cum,
      totalKm: route.totalKm,
      spots: route.spots,
      visitedSpots: j.visitedSpots,
      cityIndex: j.cityIndex,
      progressKm: Number(j.progressKm.toFixed(2)),
      percent: Math.min(1, j.progressKm / route.totalKm),
      lon: pos.lon,
      lat: pos.lat,
      heading: pos.heading,
      nextSpot,
      nextCity,
      remainKm: Number(Math.max(0, route.totalKm - j.progressKm).toFixed(1)),
      startedAt: j.startedAt
    };
  }
}

module.exports = { Journey, buildFixedRoute, buildRandomRoute, FIXED_ROUTES };
