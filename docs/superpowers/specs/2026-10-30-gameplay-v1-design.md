# MouseJourney 趣味化 v1（冲刺 / 压弯 / 幽灵车）设计

日期：2026-10-30 · 状态：已实现（与代码同步）

## 立场

- 用户选定「游戏性优先」：允许倍率类机制改变 1 真实米 = N 地图公里。
- 保留自然防作弊属性：所有里程来自真实鼠标位移，倍率只作用于真实位移，鼠标不动永远是 0。
- 只奖励不惩罚：没有扣里程的机制；乱甩鼠标只是没有压弯加成 + 颠簸表现。

## 机制

### 1. 抽鞭冲刺（点击悬浮窗主画面）
- 能量槽 0..1，靠真实移动充能：持续移动 45s（`CHARGE_MS`）充满；静止 5s 后开始以 30s 掉光的速度衰减。
- 满能量点击 → 消耗全部能量 → 15s（`WHIP_MS`）内倍率 ×2（`WHIP_MULT`）。
- 文案跟坐骑：步行「疾走」/ 自行车「摇车」/ 公交「油门到底」/ 汽车「地板油」/ 高铁「提速率」/ 飞机「加力燃烧」。
- 冲刺结束：主进程广播 `boost:event {type:'whipEnd', gainedKm, label}`，主窗 toast、悬浮窗能量条闪动。

### 2. 顺弯压弯（弯道）
- 弯道判定（渲染层）：`scenery.js` render 返回 `{bendDir, bendMag}`（前方 120m 路心横向偏移），`bendMag > 4m` 视为弯道中。
- 顺弯判定：鼠标水平速度 `vx`（tracker EMA，state:update 下发）与弯向同号且 |vx| > 60 px/s 持续 1.5s → 进入压弯，倍率 ×1.25（`LEAN_MULT`），可与冲刺叠加（×2.5）。
- 反馈：相机侧倾（canvas 绕底部中心 rotate，压弯 ±0.05rad）+ 冲刺速度线/扬尘（灰阶）。
- 状态变化时才上报 `boost:lean`（invoke），非连续流。

### 3. 幽灵车（和昨天的自己赛跑）
- 数据：`store.recordIntraday()` 每分钟记录当日累计 cm 到 `days[key].intraday[分钟]`（0..1439，稀疏数组）；跨天 `pruneIntraday(2)` 只留 2 天。
- `store.ghostMetersAt()` 取昨天同一分钟（缺样本向前最多找 60 分钟），经 `state.ghost = {have, meters}` 下发。
- 表现（仅路上视角）：领先时前方同车道半透明剪影车（z = 40 + min(150, 领先km×25) 米）；超越检测带迟滞（落后 ≥200m 武装 → 领先 ≥50m 触发）→ `boost:ghostPass` 计数 + 能量条闪动。
- 第一天无昨日数据 → have=false，无幽灵（诚实）。

## 计数与成就

`store.data.counters = { whips, leans, ghostPasses, whipDay:{key,n} }`；新成就：w_1 首次抽鞭 / w_20 单日 20 冲 / l_10 压弯 10 次 / g_10 胜昨日 10 次。achievements.js 统一 `_valueFor` 取值。

## 数据流与边界

- 倍率单一来源：`journey.multiplier()`，`addMeters` 内消费；boost/energy 为内存态（不持久化，重启归零）。
- `state:update`（2Hz）新增 `vx`、`ghost`；`journey.snapshot()` 新增 `boost` 块（energy/whipRemainS/whipLabel/leanActive/gameMult/multiplier）。
- preload 白名单新增通道 `boost:event`；invoke 新增 `boost:whip/lean/ghostPass`。
- 折叠悬浮窗：canvas 隐藏 → render 早退 → info undefined → 压弯自动退出（会补发 setLean(false)）。

## 测试

`npm run smoke` 5.5 节：能量充能、冲刺倍率 ×2 与里程翻倍、冲刺结束回落、压弯 ×1.25、计数器、intraday 记录、幽灵读取（无昨日 null / 有昨日精确值）、w_1 成就解锁。
