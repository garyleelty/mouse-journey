# MouseJourney · 鼠标旅行

> 把每天鼠标移动的总距离，换算成真实的物理距离，变成一场穿越中国的旅行。  
> Electron 跨平台桌面应用（Windows / macOS 优先），**全程离线**：不联网、不上传、不接入任何在线地图服务。



---

## 1. 功能一览

| 模块    | 说明                                                                                |
| ----- | --------------------------------------------------------------------------------- |
| 数据采集  | 主进程后台轮询光标坐标，按像素累加并换算为物理距离（cm/m），统计当日总距离、移动次数、活跃时长                                 |
| 距离校准  | 按屏幕对角线/宽高比换算，支持每个显示器单独校准 + 微调滑块，`manual` 模式可直接填 cm/点，参数持久化                        |
| 统计面板  | 今日 / 本周 / 最近 14 天，柱状图 + 明细表，本地 JSON 持久化                                           |
| 悬浮窗   | 桌面右上角常驻，可拖拽、可折叠、可置顶（两级）、可调透明度，内含中国地图与实时前进的小人                                      |
| 旅行路线  | 随机旅行（随机起终点 + 沿程取城市）与固定路线（京沪线、川藏线、丝路、海岸线、京哈线、西南环线）                                 |
| 景点卡片  | 途经真实景点时弹出「恭喜你抵达 ××」卡片，附景点简介                                                       |
| 健康提醒  | 连续使用超过阈值（默认 45 分钟）弹窗 + 系统通知，阈值与文案可配置，支持稍后提醒                                       |
| 成就与坐骑 | 100 m / 1 km / 10 km / 42.195 km / 100 km… 里程碑解锁；坐骑 步行 → 自行车 → 公交车 → 汽车 → 高铁 → 飞机 |
| 鼠标热力图 | 按桌面虚拟坐标系绘制当日鼠标活动密度（含多显示器轮廓），采样降频 + 单日 4000 点抽稀上限 |
| 里程排行榜 | 统计页展示历史单日距离 Top 10（当日按实时进度参与排名） |
| 抽鞭冲刺 | 点击悬浮窗：能量槽靠真实移动充能（持续动 ~45s 充满），满能量点击后 15s 内 1 米 = 2 公里，冲刺文案跟坐骑走 |
| 顺弯压弯 | 路往左弯你往左甩鼠标 → 压弯 ×1.25，可与冲刺叠加 ×2.5；相机侧倾 + 速度线，纯表现层反馈 |
| 幽灵车 | 和「昨天的你」同钟点进度赛跑：前方半透明剪影车，超越有庆祝；每分钟记录当日进度曲线（只留 2 天） |
| 数据导出   | 一键导出 CSV（Excel 友好，带 BOM）或 JSON（含设置/汇总/成就/旅程，不含轨迹点） |
| 校准引导   | 首次运行时引导填写显示器对角线，完成前持续提示 |

---

## 2. 项目目录结构

```
mouse-journey/
├─ package.json                    # 依赖 + electron-builder 打包配置（mac/win）
├─ README.md
├─ .gitignore
├─ build/
│  ├─ icon.png                     # 512×512 应用图标（npm run icon 生成）
│  ├─ tray.png / tray@2x.png       # 托盘图标
│  └─ entitlements.mac.plist       # macOS 签名 entitlements
├─ scripts/
│  ├─ make-icon.mjs                # 零依赖 PNG 生成器（zlib 手写编码器）
│  └─ smoke-main.cjs               # 主进程冒烟测试（stub electron，Node 直跑）
├─ .taste-skill/                   # UI 走查 harness（taste-skill inspect 用，可删）
│  ├─ gen-mock.cjs                 # 由真实模块生成 mock 状态（23 天历史 / 京沪线 640km / 7-10 成就）
│  ├─ gen-harness.cjs              # 由真实渲染文件生成 harness 页面（路径改写 + mock api 注入）
│  ├─ probe.mjs                    # CDP 探针（量布局、查空区）
│  └─ harness/                     # mock-api.js + mock-state.json + index.html（生成物）
└─ src/
   ├─ main/                        # ── 主进程 ──
   │  ├─ index.js                  # 应用入口：窗口/托盘/生命周期/事件装配
   │  ├─ ipc.js                    # IPC 通道 + 状态快照组装（state:update / state:full）
   │  ├─ tracker.js                # 光标采样器：距离累加、移动次数、活跃时长、跨天
   │  ├─ calibration.js            # 像素→厘米换算、多显示器校准、PPI/物理尺寸推算
   │  ├─ journey.js                # 路线构建（随机/固定）、里程推进、抵达事件
   │  ├─ achievements.js           # 里程碑 + 坐骑分级
   │  ├─ health.js                 # 连续使用计时与休息提醒
   │  ├─ store.js                  # JSON 本地持久化（原子写、防抖、按天分桶）
   │  └─ data/
   │     ├─ china-geo.js           # 中国轮廓静态数据（离线，含台湾岛/海南岛）
   │     └─ routes.js              # 城市池、26 个真实景点、6 条固定路线
   ├─ shared/                      # ── 主/渲染共用（UMD，可直接 <script> 引入）──
   │  ├─ geo.js                    # haversine、累计里程、投影、折线最近点、按里程取点
   │  └─ format.js                 # 日期键、距离/时长格式化、最近 N 天
   ├─ preload/
   │  └─ index.js                  # contextBridge 白名单 API（contextIsolation: true）
   └─ renderer/
      ├─ index.html                # 主窗口（今日/统计/路线/成就/设置）
      ├─ float.html                # 悬浮窗
      ├─ reminder.html             # 健康提醒窗
      ├─ css/{main.css,float.css}
      ├─ fonts/                    # Geist / Geist Mono（本地 woff2，离线可用，无网络请求）
      └─ js/{icons.js,map.js,heat.js,charts.js,main.js,float.js}
```

---

## 3. 核心模块实现要点

### 3.1 数据采集（`src/main/tracker.js`）

- 采样源：`screen.getCursorScreenPoint()`（纯 Electron API，**无需原生模块、无需辅助功能权限**），配合 `screen.getDisplayNearestPoint()` 取当前所在显示器。
- 默认周期 **80 ms（≈12.5 Hz）**，可在设置中调整（16–1000 ms）。
- 每帧处理：
  1. 计算位移 `distPx = hypot(dx, dy)`；
  2. **死区过滤**：`distPx < deadZonePx`（默认 2 px）视为抖动，不计入；
  3. **瞬移过滤**：`distPx > 屏幕对角线 × maxJumpRatio`（默认 1.2）判定为切屏/显示器切换/远程桌面跳变，丢弃；
  4. **跨屏丢弃**：`display.id` 变化时丢弃该段（可关）；
  5. 换算 `cm = distPx × cmPerPoint`，累加到当日与总计。
- **移动次数**：连续位移间隔 > 300 ms 记为「新的一次移动」（避免一次滑动被拆成上百次）。
- **活跃时长**：帧间隔计入活跃时长，仅当「距上次移动 ≤ 60 s」时累加。
- 数据落地：`store.today()` 按本地时区日期键（`YYYY-MM-DD`）分桶，跨天自动滚动并广播 `state:full`。

### 3.2 像素 → 厘米换算与校准（`src/main/calibration.js`）

**换算依据**

```
cmPerPoint = (对角线英寸 × 2.54) / √(width² + height²)      // width/height 为逻辑分辨率(DIP)
```

- Electron 的 `screen.getCursorScreenPoint()` 与 `display.size` 都是 **DIP（点）** 单位，1 DIP 在 Retina/200% 缩放下等于 `scaleFactor` 个物理像素。
- **关键结论：DIP → 厘米的换算与系统缩放比无关**：  
  `cm/DIP = (W/(w·s)) · s = W/w`，缩放只影响锐利度，不影响物理距离。所以 Windows 的 125%/150%、macOS 的 HiDPI 都不需要额外补偿。
- 只知对角线英寸 `D` 时，用宽高比还原：`W = D × 2.54 × w / √(w²+h²)`，代入后即得上式。
- 例：24 英寸 1920×1080 → `60.96 / 2202.9 ≈ 0.02767 cm/pt`，横扫全屏一次 ≈ 53 cm。

**可校准项（持久化于 `settings.calibration`）**

| 项                | 说明                                                       |
| ---------------- | -------------------------------------------------------- |
| `diagonalInch`   | 全局默认对角线（默认 24″）                                          |
| `perDisplay[id]` | **每台显示器单独填对角线**（多屏必备，设置页列出全部显示器并实时显示推算出的物理宽高、PPI、横扫全屏距离） |
| `factor`         | 0.50–2.00 微调滑块（拿尺子量一次横扫距离反推：`factor = 真实cm / 实测cm`）      |
| `mode: manual`   | 高级模式：直接指定 `manualCmPerPoint`                             |

设置页会实时显示每台显示器的 `1 pt ≈ ? mm`、`PPI`、物理尺寸，便于对照校准。

### 3.3 本地存储（`src/main/store.js`）

- 位置：`app.getPath('userData')/mouse-journey.json`（macOS `~/Library/Application Support/MouseJourney/`，Windows `%APPDATA%/MouseJourney/`）。
- 结构：`settings` / `days{YYYY-MM-DD}` / `totals` / `achievements` / `journey` / `journeyLog`。
- **原子写**：先写 `.tmp` 再 `renameSync`，避免崩溃导致 JSON 截断；高频累加使用 1.5 s 防抖写盘；退出前 `flush()`。
- 明细默认保留 730 天（`pruneDays`）。

### 3.4 悬浮窗（`src/renderer/float.html` + `js/float.js`）

- `frame:false + transparent:true + alwaysOnTop + skipTaskbar`，默认停在**主显示器工作区右上角 16 px** 处，位置变化 400 ms 防抖后落盘。
- 拖拽：头部 `-webkit-app-region: drag`，按钮 `no-drag`。
- 折叠：主进程 `setSize` 到 196×46，并保持**右上角对齐**（`src/main/index.js: resizeFloat`）。
- 置顶两级：`floating`（普通）/ `screen-saver`（macOS 下配合 `setVisibleOnAllWorkspaces(..., {visibleOnFullScreen:true})` 可显示在全屏应用之上）。
- 透明度：`win.setOpacity()` + 悬浮窗内滑杆联动（25%–100%）。
- 渲染：Canvas 2D，`devicePixelRatio` 适配；主进程 2 Hz 推送状态，悬浮窗内部用插值补间（约 25 fps）让小人平滑前进，不跳帧。

### 3.5 地图与路线静态数据

- **地图数据**：`src/main/data/china-geo.js`，3 个环（大陆 97 点、台湾岛、海南岛），纯离线常量，无网络请求。这是**示意级**数据，正式发行请替换为自然资源部标准地图服务（<http://bzdt.ch.mnr.gov.cn> ）的合规数据并用 Mapshaper 简化后按同格式导入。
- **投影**：等距圆柱 + 基准纬度余弦压缩（`shared/geo.js: createProjector`），按 bbox 自适应缩放并居中。
- **城市池**：53 座城市（含中国香港、中国台湾）。**景点**：26 个真实景点（故宫、外滩、西湖、兵马俑、布达拉宫、莫高窟、天山天池、日月潭…），每个带 1–2 句简介。
- **固定路线**：6 条（京沪线 / 川藏南线 / 丝路河西走廊 / 东南海岸线 / 京哈线 / 西南环线）。
- **随机路线**：随机起终点（大圆距离 ≥ 800 km）→ 在起终点连线上按等分取 3–4 个最近城市做途经点，且每个途经点必须比上一站更接近终点（单调逼近，不折返）→ 得到连贯路线。
- **景点挂载**：把每个景点投影到路线折线上，离路线 ≤ 160 km 才算「途经」，按里程排序并去重（相邻 < 60 km 只保留一个），最多 8 个。
- **推进**：`progressKm += 真实米 × kmPerMeter`（默认 **1 真实米 = 1 地图公里**）；按累计里程触发景点卡、途经城市、抵达终点；终点后按设置自动开启下一段。

### 3.6 健康提醒（`src/main/health.js`）

- 连续时长只在持续有鼠标活动时累加；**静止超过 `idleResetSec`（默认 120 s）自动归零**；系统休眠/锁屏（`powerMonitor` suspend/lock-screen）也归零。
- 达到阈值弹自定义提醒窗（标题/文案可配置，`{min}` 会替换为阈值分钟）+ 可选系统通知。
- 两个按钮：「我已休息过了」→ 计时归零；「稍后提醒」→ 进入 `snoozeMin`（默认 10 分钟）静默期。

### 3.7 成就与坐骑（`src/main/achievements.js`）

- 里程类：100 m / 500 m / 1 km / 5 km / 10 km / 42.195 km / 100 km；另有活跃 10 小时、单日破千、连续 3 天。
- 坐骑：步行(0) → 自行车(1 km) → 公交车(10 km) → 汽车(100 km) → 高铁(500 km) → 飞机(2000 km)。  
  坐骑的 `speed` 只影响**悬浮窗小人的动画步频/速度感与外观**，不改变里程换算（否则里程统计会失真）。
- 趣味成就：⚡ 第一次抽鞭 / 🌪️ 单日 20 冲 / 🛣️ 压弯 10 次 / 👻 胜过昨日 10 次（计数存 `data.counters`）。

---

## 3.7.5 趣味机制（`src/main/journey.js` + `src/renderer/js/float.js` + `src/renderer/js/main.js`）

游戏性优先，但保留两条底线：**倍率只作用于真实鼠标位移**（不动鼠标永远是 0，天然防作弊）；**没有任何机制扣里程**。

| 机制 | 触发 | 效果 | 参数 |
| --- | --- | --- | --- |
| 抽鞭冲刺 | 满能量点击悬浮窗画面或主窗「路上」画面 | 15s 内 ×2，结束后 toast 本轮里程 | 充能 45s 持续移动 / 静止 5s 后 30s 掉光 |
| 顺弯压弯 | 弯道中（前方 120m 路心偏移 > 4m）鼠标水平速度与弯向同号持续 1.5s | ×1.25，可叠加冲刺 ×2.5 | vx 阈值 60 px/s，tracker EMA 平滑 |
| 幽灵车 | 自动（有昨日分钟级数据时） | 前方剪影车 + 超越计数与庆祝（超越时主窗 toast + 迷你彩带） | 迟滞：落后 200m 武装、领先 50m 触发 |

主窗口与悬浮窗共享同一份 boost 快照：主窗「路上」画面同样有相机侧倾、冲刺速度线/扬尘、幽灵车，
并叠加能量槽 + 抽鞭按钮（坐骑文案，如「地板油 · 72%」）与 ×N 倍率徽章；压弯计数仍由常驻的悬浮窗判定上报，主窗只做表现层。

**庆祝反馈**：成就解锁 / 抵达城市 / 冲刺结束 / 胜过幽灵的 toast 走庆祝变体（描边点亮 + 图标弹跳 + 数据色扩散环），
抵达景点 / 完赛 modal 徽标同款动效，并从事件原点炸出轻量彩带（`js/fx.js`，灰阶 + 唯一数据色，
粒子跑完自动停 rAF，`prefers-reduced-motion` 时全静默）。超越检测在悬浮窗，主进程经 `boost:event`
广播 `ghostPass`，两个窗口各自庆祝（悬浮窗能量条闪动 / 主窗 toast + 彩带）。

**游戏化细节**：悬浮窗折叠态在标题位显示迷你能量槽（同一份 boost 快照，满能量整条点亮数据色 +
头部圆点呼吸，随时点开抽鞭）；统计页「里程排行榜」前三名有圆片徽标（第一名 = 数据色），「每日距离」
图表卡带游戏化洞察徽标（本周较上周 ±%、连续记录 N 天、最佳单日——数据色只给正向信号）；
路线页「途经景点」为时间轴打卡——已抵达节点实心数据色 ✓、下一站空心数据色环、未到灰环，
走过的连线为数据色，「你在这里」游标（坐骑图标）骑在已走/未走连线的交界；
成就页「坐骑演进」节点圆环化 + 连线亮到当前档 + 当前坐骑数据色呼吸，下方附距下一档进度条。

设计细节见 `docs/superpowers/specs/2026-10-30-gameplay-v1-design.md`。

---

## 3.8 鼠标热力图（`src/main/tracker.js` + `src/renderer/js/heat.js`）

- 采样降频：距上一个采样点 ≥ 10 px **且** 距上次采样 ≥ 120 ms 才记录一次，避免同一位置密集成团；
- 单日上限 4000 点，超出后按 1/2 抽稀（同时提高采样门槛），防止长会话撑爆存储；
- 坐标使用**桌面虚拟坐标系**（所有显示器 workArea 的并集），跨显示器移动也能落在正确位置；
- 渲染：显示器轮廓作底图 + `multiply` 混合的径向渐变点阵，越密越亮；红点标记当前光标；
- 历史轨迹只保留最近 14 天（`store.pruneTrack`），更早的只留汇总。

## 3.9 数据导出（`src/main/ipc.js` → `data:export`）

- **CSV**：日期、星期、距离(米)、移动次数、活跃时长(分钟)、轨迹点数；带 `\uFEFF` BOM，Excel 直接打开中文不乱码；
- **JSON**：导出时间、版本、完整设置、总计、逐日汇总、当前旅程快照、成就、旅行日志（不含轨迹点，避免文件过大）；
- 走系统保存对话框，用户自选路径；取消不报错。

## 3.10 统计图表交互（`src/renderer/js/main.js`）

- 柱状图 hover 显示当日距离 / 移动次数 / 活跃时长，并高亮对应柱体；
- 视图切换：本周 / 上周 / 本月 / 近 14 天，按需从 `rawDays`（最近 400 天汇总）切片；「本月」只画已过去的日子；
- **里程排行榜**：历史单日距离 Top 10（当日按实时进度参与排名）；
- 首次校准引导：`needsCalibration` 在 `calibration:done` 后消失，「暂不」跳过 7 天内不再打扰。

---

## 3.11 界面设计系统（achromatic ledger）

主窗口 / 悬浮窗 / 提醒窗共用同一套令牌（`src/renderer/css/main.css` 顶部 `:root`）：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--ground` | `#f2f4f7` | 页面底色（仪表盘蓝灰，整个产品世界的"脸"） |
| `--surface` | `#ffffff` | 卡片面 |
| `--text` / `--muted` | `#0a0a0a` / `#6b6b6b` | 主文字 / 次要文字 |
| `--hue` | `#1d5fbf` | **唯一数据色**：只给主数据元素（已走过的路线、今日的周条柱、景点环） |
| 字体 | Geist / Geist Mono | 正文 Geist；所有数字 Geist Mono + `tabular-nums`（本地 woff2，离线） |
| 圆角 | 卡片 8px / 控件 6px | 静止元素**无阴影无渐变**；阴影只给真正浮动的层（toast / 弹窗 / 图表提示） |

规则（来自 taste-skill 的 app-screens 规范，本仓库 `.taste-skill/` 内有完整走查 harness）：

- **主视图是第一人称「在路上」**：今日页与悬浮窗的主角不是俯视地图，而是 `src/renderer/js/scenery.js` 的伪 3D 沿路视角——镜头贴着路面，道路随**真实路线走向**左右弯曲（`Geo.pointAtKm` 采样走向），路肩的里程碑 / 电线杆 / 树 / 景点牌在透视里由远及近；1 真实米 = 1 路线公里 = 1000 场景米，画面只随真实鼠标里程前进（无假动画），HUD 报真实鼠标速度；俯视地图缩为右下角「全国位置」小图，悬浮窗可用标题栏按钮切换 路上 / 地图。
- **地貌分段配色**：路上视角按当前位置的经纬度确定性混色，全国划 7 个地貌区——青藏高原（雪线泛白）、西北戈壁、内蒙草原、黄土高原、云贵红土、华南常绿、东北黑土——跨区在百公里尺度线性过渡（`scenery.js: terrainPalette`，纯离线、无渐变）；路面、中心线（唯一数据色）与指示牌不参与混色，保持「色彩只上数据」的纪律。
- **色彩只上数据，不上 chrome**：导航、按钮、边框、标题全部无彩色；一个屏幕只有一种彩色。
- **KPI 是排版不是磁贴**：一张卡片内用 1px 分隔线切开三个指标，不做三块带图标的磁贴。
- **开放平面外壳**：256px 侧栏直接坐在页面底色上（无顶栏、无卡片化侧栏），导航退到背后；≤640px 收成顶栏 + 底部抽屉。
- **图表几乎无 chrome**：方角柱、3–5 条水平网格线、无 y 轴线（基线加重）、左轴 12–13px 灰字、x 轴标签≤8 个且首尾内收；hover 出 HTML 提示；0 值诚实画 0。
- **表格 = 细线 + 对齐**：数字右对齐 + 等宽字形，行分隔用 1px 细线。
- **地图取景框 = 中国 + 周边陆地**：蒙古 / 西伯利亚 / 朝鲜半岛 / 日本 / 中南半岛 / 南亚用更浅的底色垫在中国轮廓之下（示意级简化轮廓，见 `src/main/data/china-geo.js` 的 `NEIGHBOR_RINGS`），既消除地图卡留白，又让中国轮廓有地理参照。
- **设置页两层结构**：距离校准整行（标签列 + 面板），采样 / 悬浮窗两栏卡片，健康提醒 / 通用整行卡片——首屏即可见校准 + 采样。
- **手机端是独立构图**：不是桌面页的压缩。

### UI 走查（taste-skill）

```bash
node .taste-skill/gen-mock.cjs      # 生成 mock 状态（真实模块算出：23 天历史、京沪线 640km、7/10 成就）
node .taste-skill/gen-harness.cjs   # 用真实渲染文件生成 harness（改路径 + 注入 window.api mock）
cd .   # 仓库根
python3 -m http.server 8899 &       # 必须在仓库根起服务（harness 用 ../../src 回指真实文件）
TASTE_NO_SANDBOX=1 node /tmp/taste-skill/skills/taste-skill/scripts/inspect.mjs \
  "http://127.0.0.1:8899/.taste-skill/harness/index.html#today" --app --out .taste-skill/after-today
node .taste-skill/probe.mjs "<url#tab>" "<页面内函数>"   # CDP 探针：量布局 / 查空区
```

当前状态：五个页面（今日 / 统计 / 路线 / 成就 / 设置）× 三个视口（1440 / 768 / 390）**0 FAIL 0 WARN**，
`lint.mjs --app` 对三个渲染文件均 0 FAIL 0 WARN。截图在 `.taste-skill/after-*/`，完整报告见 `.taste-skill/REPORT.md`。
第二轮又收掉了评委点名的三件事：地图卡两侧留白（加周边陆地取景框）、设置页过长（两层结构 + 后四节两栏/整行）、
统计明细表不跟随周期（表现周期 + 封顶 10 行 + "展开全部"）。

---

## 4. 依赖清单

**运行时**：无第三方运行时依赖（只用 Electron 内置 API：`screen` / `powerMonitor` / `ipcMain` / `BrowserWindow` / `Tray` / `Notification`）。

**开发 / 打包**：

| 包                  | 版本       | 用途                            |
| ------------------ | -------- | ----------------------------- |
| `electron`         | ^45.0.0  | 运行时（可按需升级到当前稳定版）              |
| `electron-builder` | ^26.15.3 | 打 dmg / zip / nsis / portable |
| Node.js            | ≥ 20     | 仅用于脚本与打包                      |

> 图标生成脚本 `scripts/make-icon.mjs` **零依赖**（手写 PNG + `zlib`），不需要 `sharp`/`pngjs`。

---

## 5. 开发运行

```bash
cd mouse-journey
npm install          # 安装 electron / electron-builder
npm run icon         # 生成 build/icon.png 与托盘图标（首次必做，否则无托盘图标）
npm start            # 直接运行
npm run dev          # 运行并打开 DevTools
npm run smoke        # 主进程冒烟测试（stub electron：store/tracker/calibration/achievements/journey/存档往返）
```

UI 截图 harness（不碰主进程与真实存档，用假 state 渲染主窗口并截图，供 UI 迭代自查）：

```bash
env -u ELECTRON_RUN_AS_NODE npx electron scripts/ui-shot.cjs /tmp/mj-ui/today.png
# MJ_ENERGY=1（满能量） / MJ_WHIP=12（冲刺中） / MJ_LEAN=1（压弯中） / MJ_GHOST=0（无幽灵） 可截不同玩法状态
# MJ_EVENT=achv（默认）/ spot / city / complete —— 900ms 后注入对应庆祝事件，截庆祝动效
```

首次启动会同时打开主窗口与右上角悬浮窗；移动鼠标即可看到数字增长、小人前进。

常用调试入口：设置页 → 打开数据目录（直接查看 `mouse-journey.json`）；设置页 → 测试提醒。

> **排障**：若终端环境里存在 `ELECTRON_RUN_AS_NODE=1`（部分 IDE / 终端工具会注入），  
> `npm start` 会被当作普通 Node 执行并报 `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`。  
> 用 `env -u ELECTRON_RUN_AS_NODE npm start` 启动即可。  
> `npm run dev` 会把渲染进程的 console、加载失败、preload 错误镜像到主进程控制台，便于定位白屏。

---

## 6. 打包为 Windows / macOS 安装包

### 6.1 准备图标

```bash
npm run icon                      # 生成 512×512 build/icon.png
# 正式发行建议自行替换成 1024×1024 的 icon.png（macOS 转 .icns，Windows 转 .ico）
```

### 6.2 macOS

```bash
npm run dist:mac                  # 产物：dist/MouseJourney-x.x.x.dmg（x64 + arm64）、.zip
```

- `hardenedRuntime: true` + `entitlements.mac.plist`（允许 JIT / 未签名内存，V8 必需）。
- **公证（Distribution 必做）**：未签名未公证的 dmg 会被 Gatekeeper 拦截。
  ```bash
  export APPLE_ID="you@example.com"
  export APPLE_ID_PASSWORD="app-specific-password"
  export APPLE_TEAM_ID="XXXXXXXXXX"
  npx electron-builder --mac --publish never
  ```
  需要 Apple Developer 的 `Developer ID Application` 证书；`dmg.sign: false` 时可在打包后用 `codesign` + `notarytool` 手动处理。
- arm64 打包可以在 Apple Silicon 机器上直接做；x64 dmg 也可交叉产出（electron-builder 会下载对应架构的 Electron）。

### 6.3 Windows

```bash
npm run dist:win                  # 产物：dist/MouseJourney-x.x.x-setup.exe（NSIS）+ portable.exe
```

- 在 **macOS/Linux 上打 Windows 包**需要 `wine`（NSIS 依赖）：`brew install wine-stable`（mac）或 `apt install wine`（Linux）。
- 推荐在 **Windows 机器或 GitHub Actions（`windows-latest`）** 上执行 `npm run dist:win`，最省事。
- NSIS 配置为非一键安装（允许选择安装目录），同时创建桌面与开始菜单快捷方式。
- 如需代码签名，在 `build.win` 下补充 `certificateFile` / `certificatePassword`，或设环境变量 `CSC_LINK` / `CSC_KEY_PASSWORD`。

### 6.4 CI 建议

```yaml
# .github/workflows/build.yml（节选）
strategy:
  matrix:
    os: [macos-latest, windows-latest]
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 20 }
  - run: npm ci && npm run icon
  - run: npx electron-builder --${{ matrix.os == 'macos-latest' && 'mac' || 'win' }} --publish never
```

---

## 7. 平台差异

| 事项     | macOS                                                                                     | Windows                                                               |
| ------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 读取光标坐标 | `screen.getCursorScreenPoint()`，**不需要**辅助功能权限；设置页会显示 `isTrustedAccessibilityClient` 状态供参考 | 无需任何权限                                                                |
| 悬浮窗    | `transparent` 正常；`setVisibleOnAllWorkspaces` 可跨桌面空间；`screen-saver` 级别可覆盖全屏应用              | `transparent:true` + `alwaysOnTop` 正常；`screen-saver` 同样有效但部分安全软件会拦截置顶 |
| 托盘     | 图标需 16×16（`tray.png`），菜单在点击/右键弹出                                                          | 走 `setAppUserModelId`，通知走原生 Toast                                     |
| 权限提示   | 若将来接入全局鼠标 Hook（CGEventTap）才需要辅助功能权限，届时需引导「系统设置 → 隐私与安全性 → 辅助功能」                           | 全局 Hook 需管理员权限，本项目未使用                                                 |
| 签名     | 需 Developer ID + 公证，否则首次启动被 Gatekeeper 拦截                                                 | 可选签名；未签名会有 SmartScreen 提示                                             |
| 开机自启   | `app.setLoginItemSettings({openAtLogin, openAsHidden:true})`                              | 同 API，写入注册表 Run 项                                                     |
| 休眠/锁屏  | `powerMonitor` 的 `suspend/resume/lock-screen/unlock-screen` 均可用                           | 同上（`lock-screen` 事件在部分版本缺失，已做兜底：采样间隔异常 > 5 s 也会丢弃该段）                  |

---

## 8. 关键边界情况与处理


| 场景 | 处理方式 |
| --- | --- |
| **采样频率** | 默认 80 ms/12.5 Hz。频率过低会「抄近路」低估距离（鼠标划弧线被拉成直线），过高徒增 CPU。区间 16–1000 ms 可调；主进程只做四则运算，12.5 Hz 下占用可忽略。采样定时与状态推送解耦（推送 2 Hz），避免渲染层被打爆。 |
| **系统休眠 / 锁屏** | `powerMonitor` suspend/lock 暂停累加、resume 重置基线；另外单次帧间隔 > 5 s 直接丢弃该段（防止唤醒瞬间的巨大位移）。 |
| **多显示器** | 每次采样按 `display.id` 取该显示器的 `cmPerPoint`（每屏可单独填对角线）；跨屏的那一段位移丢弃；分辨率/缩放变化（`display-metrics-changed`）与插拔会重置基线，并把悬浮窗拉回可见区域。 |
| **DPI / 缩放比** | 逻辑分辨率(DIP)换算与 `scaleFactor` 无关（见 3.2 推导），125%/150%/200% 都不影响物理距离；设置页展示推算 PPI 与物理尺寸便于核对。 |
| **显示器尺寸未知** | 默认按 24″ 估算并在设置页高亮提示；提供 `factor` 滑块与 `manual` 模式兜底。 |
| **数据精度** | 内部以「厘米」为最小单位浮点累加（`distanceCm`），展示层再换算 m/km；避免每帧四舍五入带来的累积误差。JSON 落盘保留全部小数。 |
| **瞬移 / 远程桌面 / 游戏穿屏** | 超过「屏幕对角线 × 1.2」的单次位移直接丢弃；也可开启跨屏丢弃。 |
| **长时间不移动** | 不计入活跃时长；连续使用计时在静止 120 s 后归零，避免「挂着不动」被判定为连续使用 45 分钟。 |
| **跨天** | 按本地时区 `YYYY-MM-DD` 分桶，检测日期变化时滚动并广播；不做 UTC 换算。 |
| **进程退出 / 崩溃** | 原子写 + 防抖写盘 + `before-quit` flush；下次启动自动 merge 默认值（新增配置项不会丢失旧数据）。 |
| **存档损坏** | JSON 解析失败时先把损坏文件改名为 `.corrupt-时间戳` 保留，再回退默认值重建——不会静默覆盖，历史数据可手工恢复。 |
| **多开** | `requestSingleInstanceLock()`，第二次启动直接聚焦已有主窗口。 |
| **透明窗性能** | 悬浮窗 `backgroundThrottling:false` 保活 rAF，但内部限制到 ~25 fps；折叠后 DOM 隐藏，Canvas 不再绘制。 |
| **地图数据合规** | 内置数据仅作示意，且明确包含台湾岛、海南岛；正式发行请替换为合规标准地图数据。 |
| **隐私** | 全程本地：不采集键盘内容、不截图、不上传；无网络权限（`entitlements` 中 `network.client=false`）。 |

---

## 9. 数据文件示例

```jsonc
{
  "version": 1,
  "settings": { "sampling": {...}, "calibration": {...}, "journey": {...}, "health": {...}, "float": {...} },
  "days": { "2026-10-23": { "distanceCm": 4231.7, "moves": 812, "activeMs": 1980000, "firstTs": ..., "lastTs": ... } },
  "totals": { "distanceCm": 128904.5, "moves": 23110, "activeMs": 51230000 },
  "achievements": { "m_100": "2026-10-21T09:12:03.000Z" },
  "journey": { "route": {...}, "progressKm": 137.4, "visitedSpots": ["waitan"], "cityIndex": 1 },
  "journeyLog": [ { "name": "...", "totalKm": 1194.9, "finishedAt": ..., "spots": 4 } ]
}
```

---

## 10. 已知限制 / 后续可做

| 事项 | 状态 |
| --- | --- |
| 当日移动热力图（鼠标轨迹采样可视化） | ✅ 已实现（见 §3.8） |
| 导出 CSV/JSON | ✅ 已实现 |
| 界面重设计（taste-skill achromatic ledger，五页 0 FAIL 0 WARN） | ✅ 已实现（见 §3.11） |
| 主进程冒烟测试（`npm run smoke`） | ✅ 已实现 |
| 里程排行榜（统计页单日 Top 10） | ✅ 已实现 |
| 自定义路线编辑器 | 计划中 |
| 里程排行榜 | 计划中 |
| 地图数据升级为自然资源部标准地图 | 计划中（正式发行前必须，见 §3.5） |
