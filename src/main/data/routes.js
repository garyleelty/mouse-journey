'use strict';

const Geo = require('../../shared/geo');

/** 城市池：随机路线从这里挑点；固定路线通过城市名引用 */
const CITIES = [
  { name: '北京', lon: 116.41, lat: 39.90, province: '北京' },
  { name: '上海', lon: 121.47, lat: 31.23, province: '上海' },
  { name: '广州', lon: 113.26, lat: 23.13, province: '广东' },
  { name: '深圳', lon: 114.06, lat: 22.54, province: '广东' },
  { name: '成都', lon: 104.07, lat: 30.57, province: '四川' },
  { name: '重庆', lon: 106.55, lat: 29.56, province: '重庆' },
  { name: '西安', lon: 108.94, lat: 34.34, province: '陕西' },
  { name: '杭州', lon: 120.15, lat: 30.28, province: '浙江' },
  { name: '南京', lon: 118.80, lat: 32.06, province: '江苏' },
  { name: '苏州', lon: 120.62, lat: 31.32, province: '江苏' },
  { name: '武汉', lon: 114.31, lat: 30.59, province: '湖北' },
  { name: '长沙', lon: 112.94, lat: 28.23, province: '湖南' },
  { name: '昆明', lon: 102.83, lat: 24.88, province: '云南' },
  { name: '大理', lon: 100.23, lat: 25.60, province: '云南' },
  { name: '丽江', lon: 100.23, lat: 26.87, province: '云南' },
  { name: '桂林', lon: 110.29, lat: 25.27, province: '广西' },
  { name: '南宁', lon: 108.32, lat: 22.82, province: '广西' },
  { name: '海口', lon: 110.20, lat: 20.04, province: '海南' },
  { name: '三亚', lon: 109.51, lat: 18.25, province: '海南' },
  { name: '厦门', lon: 118.09, lat: 24.48, province: '福建' },
  { name: '福州', lon: 119.30, lat: 26.08, province: '福建' },
  { name: '青岛', lon: 120.38, lat: 36.07, province: '山东' },
  { name: '济南', lon: 117.00, lat: 36.65, province: '山东' },
  { name: '泰安', lon: 117.09, lat: 36.20, province: '山东' },
  { name: '天津', lon: 117.20, lat: 39.13, province: '天津' },
  { name: '郑州', lon: 113.63, lat: 34.75, province: '河南' },
  { name: '洛阳', lon: 112.45, lat: 34.62, province: '河南' },
  { name: '太原', lon: 112.55, lat: 37.87, province: '山西' },
  { name: '平遥', lon: 112.18, lat: 37.20, province: '山西' },
  { name: '石家庄', lon: 114.51, lat: 38.04, province: '河北' },
  { name: '沈阳', lon: 123.43, lat: 41.80, province: '辽宁' },
  { name: '大连', lon: 121.62, lat: 38.92, province: '辽宁' },
  { name: '长春', lon: 125.32, lat: 43.82, province: '吉林' },
  { name: '哈尔滨', lon: 126.53, lat: 45.80, province: '黑龙江' },
  { name: '呼和浩特', lon: 111.75, lat: 40.84, province: '内蒙古' },
  { name: '银川', lon: 106.23, lat: 38.49, province: '宁夏' },
  { name: '兰州', lon: 103.83, lat: 36.06, province: '甘肃' },
  { name: '张掖', lon: 100.45, lat: 38.93, province: '甘肃' },
  { name: '嘉峪关', lon: 98.28, lat: 39.79, province: '甘肃' },
  { name: '敦煌', lon: 94.66, lat: 40.14, province: '甘肃' },
  { name: '西宁', lon: 101.78, lat: 36.62, province: '青海' },
  { name: '拉萨', lon: 91.14, lat: 29.65, province: '西藏' },
  { name: '林芝', lon: 94.36, lat: 29.65, province: '西藏' },
  { name: '康定', lon: 101.96, lat: 30.05, province: '四川' },
  { name: '理塘', lon: 100.27, lat: 30.00, province: '四川' },
  { name: '乌鲁木齐', lon: 87.62, lat: 43.79, province: '新疆' },
  { name: '喀什', lon: 75.99, lat: 39.47, province: '新疆' },
  { name: '贵阳', lon: 106.63, lat: 26.65, province: '贵州' },
  { name: '合肥', lon: 117.28, lat: 31.86, province: '安徽' },
  { name: '黄山', lon: 118.17, lat: 30.13, province: '安徽' },
  { name: '南昌', lon: 115.89, lat: 28.68, province: '江西' },
  { name: '香港', lon: 114.17, lat: 22.32, province: '中国香港' },
  { name: '台北', lon: 121.56, lat: 25.03, province: '中国台湾' }
];

const CITY_MAP = new Map(CITIES.map((c) => [c.name, c]));

/** 真实景点卡片数据（离线内置） */
const SPOTS = [
  { id: 'gugong', name: '故宫博物院', city: '北京', lon: 116.397, lat: 39.918, emoji: '🏯',
    intro: '明清两代的皇家宫殿，世界上现存规模最大、保存最为完整的木质结构古建筑群，中轴线纵贯南北。' },
  { id: 'changcheng', name: '八达岭长城', city: '北京', lon: 116.016, lat: 40.362, emoji: '🧱',
    intro: '万里长城的精华段落，居庸关北口的咽喉要道，"不到长城非好汉"说的就是这里。' },
  { id: 'waitan', name: '外滩', city: '上海', lon: 121.490, lat: 31.240, emoji: '🌃',
    intro: '52 栋风格迥异的万国建筑博览群沿江排开，对岸是陆家嘴的摩天天际线。' },
  { id: 'xihu', name: '西湖', city: '杭州', lon: 120.145, lat: 30.245, emoji: '🛶',
    intro: '一湖碧水、三面云山，苏堤春晓与断桥残雪写进了无数宋词里。' },
  { id: 'zhuozheng', name: '拙政园', city: '苏州', lon: 120.629, lat: 31.325, emoji: '🎋',
    intro: '江南园林的代表作，以水为中心，远香堂与小飞虹构成层层叠叠的框景。' },
  { id: 'bingmayong', name: '秦始皇兵马俑', city: '西安', lon: 109.278, lat: 34.385, emoji: '🗿',
    intro: '秦始皇陵的陪葬坑，八千陶俑列阵地下两千余年，每个面容都不相同。' },
  { id: 'panda', name: '成都大熊猫繁育研究基地', city: '成都', lon: 104.145, lat: 30.735, emoji: '🐼',
    intro: '全球最大的大熊猫迁地保护基地，幼崽在育幼箱里翻滚的模样治愈了无数人。' },
  { id: 'lijiang', name: '漓江', city: '桂林', lon: 110.300, lat: 25.050, emoji: '🏞️',
    intro: '"桂林山水甲天下"，二十元人民币背面的取景地就在兴坪段。' },
  { id: 'budala', name: '布达拉宫', city: '拉萨', lon: 91.117, lat: 29.658, emoji: '🛕',
    intro: '海拔 3700 米的红山之上，藏式宫堡建筑群的巅峰之作，白宫与红宫层叠而上。' },
  { id: 'namco', name: '纳木错', city: '拉萨', lon: 90.600, lat: 30.700, emoji: '💧',
    intro: '海拔 4718 米的高原咸水湖，藏语意为"天湖"，星空倒映湖面如同另一条银河。' },
  { id: 'tianmen', name: '天门山', city: '张家界', lon: 110.480, lat: 29.050, emoji: '⛰️',
    intro: '99 道弯的盘山公路直上天门洞，玻璃栈道悬于千米绝壁之上。' },
  { id: 'huangshan', name: '黄山', city: '黄山', lon: 118.167, lat: 30.133, emoji: '🌲',
    intro: '奇松、怪石、云海、温泉"四绝"齐备，徐霞客两度登临后叹"登黄山天下无山"。' },
  { id: 'taishan', name: '泰山', city: '泰安', lon: 117.100, lat: 36.250, emoji: '🌄',
    intro: '五岳之首，历代帝王封禅之地，十八盘 1633 级台阶直抵南天门。' },
  { id: 'erhai', name: '洱海', city: '大理', lon: 100.190, lat: 25.770, emoji: '🌊',
    intro: '苍山十九峰倒映其中，环海西路是国内最舒服的骑行路线之一。' },
  { id: 'gulangyu', name: '鼓浪屿', city: '厦门', lon: 118.067, lat: 24.447, emoji: '🎹',
    intro: '被称为"琴岛"，万国建筑与钢琴声交织的步行小岛，全岛禁止机动车。' },
  { id: 'mogao', name: '莫高窟', city: '敦煌', lon: 94.808, lat: 40.043, emoji: '🕳️',
    intro: '735 座洞窟、4.5 万平方米壁画，丝绸之路上的美术馆，藏经洞改写了一门学科。' },
  { id: 'danxia', name: '张掖七彩丹霞', city: '张掖', lon: 100.030, lat: 38.970, emoji: '🎨',
    intro: '彩色丘陵像打翻的调色盘铺展在祁连山下，日落时分颜色最浓烈。' },
  { id: 'tianchi', name: '天山天池', city: '乌鲁木齐', lon: 88.117, lat: 43.887, emoji: '🏔️',
    intro: '博格达峰脚下的高山湖泊，古称"瑶池"，湖面随天光从墨绿转为湛蓝。' },
  { id: 'pingyao', name: '平遥古城', city: '平遥', lon: 112.176, lat: 37.201, emoji: '🏮',
    intro: '保存完好的明清汉民族城市标本，日昇昌票号开启了中国银行业的雏形。' },
  { id: 'longmen', name: '龙门石窟', city: '洛阳', lon: 112.470, lat: 34.560, emoji: '🪨',
    intro: '北魏至唐开凿的石窟艺术宝库，卢舍那大佛已在此微笑了一千三百年。' },
  { id: 'hukou', name: '壶口瀑布', city: '临汾', lon: 110.440, lat: 36.150, emoji: '💦',
    intro: '黄河在此收束为 50 米宽的激流，"千里黄河一壶收"说的就是它。' },
  { id: 'zhongyang', name: '中央大街', city: '哈尔滨', lon: 126.617, lat: 45.772, emoji: '🍦',
    intro: '面包石铺就的百年步行街，零下二十度吃一根马迭尔冰棍是这里的仪式感。' },
  { id: 'yalong', name: '亚龙湾', city: '三亚', lon: 109.640, lat: 18.220, emoji: '🏖️',
    intro: '7 公里长的白沙滩，中国最南端的热带海湾，海水能见度可达 10 米。' },
  { id: 'yading', name: '稻城亚丁', city: '稻城', lon: 100.300, lat: 28.440, emoji: '🏔️',
    intro: '仙乃日、央迈勇、夏诺多吉三座神山环抱牛奶海，被称为"蓝色星球上的最后一片净土"。' },
  { id: 'rilutan', name: '日月潭', city: '中国台湾', lon: 120.910, lat: 23.860, emoji: '🚣',
    intro: '中国台湾最大的天然湖泊，以拉鲁岛为界，北半湖形如日轮、南半湖形如月钩。' },
  { id: 'victoria', name: '维多利亚港', city: '中国香港', lon: 114.170, lat: 22.295, emoji: '🌉',
    intro: '中国香港的标志性海港，夜幕下两岸摩天楼组成的灯火长卷举世闻名。' }
];

const SPOT_MAP = new Map(SPOTS.map((s) => [s.id, s]));

/** 固定路线：按顺序途经的城市名 */
const FIXED_ROUTES = [
  {
    id: 'jinghu',
    name: '京沪线 · 上海 → 北京',
    desc: '沿着京杭大运河与京沪高铁的走向北上，从外滩的万国建筑走到故宫的红墙。',
    waypoints: ['上海', '苏州', '南京', '泰安', '济南', '天津', '北京']
  },
  {
    id: 'chuanzang',
    name: '川藏南线 · 成都 → 拉萨',
    desc: '翻越折多山、理塘与米拉山，海拔从 500 米一路爬升到 3700 米。',
    waypoints: ['成都', '康定', '理塘', '林芝', '拉萨']
  },
  {
    id: 'silkroad',
    name: '丝路河西走廊 · 西安 → 敦煌',
    desc: '出长安、过黄河、穿走廊，一路向西直到鸣沙山下的莫高窟。',
    waypoints: ['西安', '兰州', '张掖', '嘉峪关', '敦煌']
  },
  {
    id: 'coast',
    name: '东南海岸线 · 杭州 → 三亚',
    desc: '贴着海岸线一路南下，从西湖的断桥走到亚龙湾的白沙滩。',
    waypoints: ['杭州', '福州', '厦门', '广州', '海口', '三亚']
  },
  {
    id: 'jingha',
    name: '京哈线 · 北京 → 哈尔滨',
    desc: '出山海关进入东北平原，在中央大街的面包石上结束旅程。',
    waypoints: ['北京', '天津', '沈阳', '长春', '哈尔滨']
  },
  {
    id: 'southwest',
    name: '西南环线 · 广州 → 丽江',
    desc: '喀斯特、高原与雪山轮番登场，终点是玉龙雪山脚下的古城。',
    waypoints: ['广州', '桂林', '贵阳', '昆明', '大理', '丽江']
  }
];

/** 随机路线可选的起终点池（过滤掉过小的城市，保证路线有长度） */
const RANDOM_POOL = [
  '北京', '上海', '广州', '深圳', '成都', '重庆', '西安', '杭州', '南京', '武汉',
  '长沙', '昆明', '丽江', '桂林', '三亚', '厦门', '青岛', '哈尔滨', '乌鲁木齐',
  '拉萨', '敦煌', '呼和浩特', '沈阳', '大连', '香港', '台北', '贵阳', '兰州'
];

module.exports = {
  CITIES,
  CITY_MAP,
  SPOTS,
  SPOT_MAP,
  FIXED_ROUTES,
  RANDOM_POOL,
  Geo
};
