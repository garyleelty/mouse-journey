'use strict';

const { screen } = require('electron');

/**
 * 像素 → 物理距离换算
 * ------------------------------------------------------------------
 * 换算依据：
 *   Electron 的 screen.getCursorScreenPoint() 返回的是「屏幕坐标点(point/DIP)」，
 *   display.size 同样是 DIP 单位；一个 DIP 在 HiDPI 屏上等于 scaleFactor 个物理像素。
 *
 *   关键结论：**DIP → 厘米的换算与 scaleFactor 无关**。
 *   证明：设屏幕物理宽 W cm，逻辑宽 w DIP，物理像素宽 w·s。
 *        cm/物理像素 = W / (w·s)，而 1 DIP = s 个物理像素，
 *        ⇒ cm/DIP = (W / (w·s)) · s = W / w。
 *   也就是说只要知道「屏幕物理尺寸 + 分辨率的宽高比」，就能得到每个 DIP 的实际长度，
 *   缩放比（scaleFactor / Windows 的 125%、150%）只影响锐利度，不影响物理距离。
 *
 *   若用户只知道对角线英寸 D(inch) 和宽高比 w:h，则
 *        W = D × 2.54 × w / √(w² + h²)
 *        cmPerPoint = (D × 2.54) / √(w² + h²)        （w、h 用 DIP 即可，比值相同）
 *
 *   示例：24 英寸 16:9 → √(16²+9²)=18.36 → cmPerPoint = 60.96 / 18.36 ≈ 3.32 cm？
 *        注意：这里 w、h 需代入实际 DIP 数值（如 1920×1080 → √=2202.9），
 *        cmPerPoint = 60.96 / 2202.9 ≈ 0.02767 cm。见下方实现。
 *
 * 校准项（持久化在 settings.calibration）：
 *   1. diagonalInch    —— 全局默认对角线尺寸（英寸）
 *   2. perDisplay[id]  —— 每个显示器单独的对角线尺寸（多显示器必备）
 *   3. factor          —— 微调滑块 0.50 ~ 2.00，兜底修正（如外接显示器标称尺寸不准）
 *   4. manualCmPerPoint—— 高级模式：直接手工填写「1 DIP = ? cm」
 *   5. 「校准滑块」—— 用已知物理长度（如 10 cm 的尺子）横屏滑动，反推 factor：
 *        factor = 真实距离(cm) / 实测距离(cm)
 */
function diagonalInchFor(display, cal) {
  if (cal.perDisplay && cal.perDisplay[display.id] != null) return cal.perDisplay[display.id];
  return cal.diagonalInch || 24;
}

/** 单个显示器的换算结果 */
function describeDisplay(display, cal) {
  const w = display.size.width;
  const h = display.size.height;
  const diagDip = Math.hypot(w, h);
  const inch = diagonalInchFor(display, cal);
  const diagCm = inch * 2.54;
  const factor = cal.factor || 1;

  const cmPerPoint =
    cal.mode === 'manual' && cal.manualCmPerPoint > 0
      ? cal.manualCmPerPoint
      : (diagCm / diagDip) * factor;

  const widthCm = w * cmPerPoint;
  const heightCm = h * cmPerPoint;

  return {
    id: display.id,
    label: display.id === screen.getPrimaryDisplay().id ? '主显示器' : `显示器 #${display.id}`,
    primary: display.id === screen.getPrimaryDisplay().id,
    bounds: display.bounds,
    sizeDip: { width: w, height: h },
    scaleFactor: display.scaleFactor || 1,
    physicalPx: { width: Math.round(w * (display.scaleFactor || 1)), height: Math.round(h * (display.scaleFactor || 1)) },
    rotation: display.rotation || 0,
    internal: !!display.internal,
    diagonalInch: inch,
    diagonalCm: Number(diagCm.toFixed(2)),
    widthCm: Number(widthCm.toFixed(2)),
    heightCm: Number(heightCm.toFixed(2)),
    ppi: Number(((Math.hypot(w, h) * (display.scaleFactor || 1)) / (inch || 1)).toFixed(1)),
    cmPerPoint,
    // 参考：横扫整屏一次 ≈ 多少厘米
    sweepCm: Number((w * cmPerPoint).toFixed(1))
  };
}

/** 取光标所在显示器的 cmPerPoint（每次采样都要用，做了轻量缓存） */
function cmPerPointFor(display, cal) {
  const w = display.size.width;
  const h = display.size.height;
  if (cal.mode === 'manual' && cal.manualCmPerPoint > 0) return cal.manualCmPerPoint;
  const inch = diagonalInchFor(display, cal) || 24;
  return ((inch * 2.54) / Math.hypot(w, h)) * (cal.factor || 1);
}

function listDisplays(cal) {
  return screen.getAllDisplays().map((d) => describeDisplay(d, cal));
}

module.exports = { describeDisplay, cmPerPointFor, listDisplays, diagonalInchFor };
