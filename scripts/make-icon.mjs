#!/usr/bin/env node
/**
 * 生成打包图标（纯 Node，无第三方依赖）：
 *   build/icon.png      512×512（electron-builder 会自动转 .icns / .ico）
 *   build/tray.png      32×32
 *   build/tray@2x.png   64×64
 * 若你有自己的设计稿，直接覆盖 build/icon.png 即可（建议 1024×1024）。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build');
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- 极简 PNG 编码器 ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    rgba.copy(raw, p, y * width * 4, (y + 1) * width * 4);
    p += width * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- 绘制 ---------------- */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const r = size * 0.22;           // 圆角
  const cx = size / 2;
  const cy = size / 2;

  // 箭头（鼠标指针）在归一化坐标下的一组顶点
  const arrow = [
    [0.30, 0.26], [0.30, 0.74], [0.44, 0.61], [0.53, 0.80], [0.62, 0.76],
    [0.53, 0.58], [0.72, 0.56]
  ];
  const inside = (px, py) => {
    // 射线法判定多边形内部
    let hit = false;
    for (let i = 0, j = arrow.length - 1; i < arrow.length; j = i++) {
      const [xi, yi] = arrow[i];
      const [xj, yj] = arrow[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;

      // 圆角矩形遮罩
      const dx = Math.max(r - x - 0.5, x + 0.5 - (size - r), 0);
      const dy = Math.max(r - y - 0.5, y + 0.5 - (size - r), 0);
      const insideRect = Math.hypot(dx, dy) <= r;

      // 渐变：#5b55f0 → #9b7cf8（斜向）
      const t = clamp01((u + v) / 2);
      let R = lerp(91, 155, t);
      let G = lerp(85, 124, t);
      let B = lerp(240, 248, t);
      let A = 255;

      if (!insideRect) {
        A = 0;
      } else if (inside(u, v)) {
        // 白色箭头 + 细描边
        R = 255; G = 255; B = 255;
      }

      // 轻微内发光让图标不那么平
      const d = Math.hypot(u - 0.5, v - 0.5);
      if (insideRect && !inside(u, v)) {
        const glow = clamp01(1 - d * 1.6) * 26;
        R += glow; G += glow; B += glow;
      }

      buf[i] = Math.round(clamp01(R / 255) * 255);
      buf[i + 1] = Math.round(clamp01(G / 255) * 255);
      buf[i + 2] = Math.round(clamp01(B / 255) * 255);
      buf[i + 3] = A;
    }
  }
  void cx; void cy;
  return buf;
}

const targets = [
  ['icon.png', 512],
  ['tray.png', 32],
  ['tray@2x.png', 64]
];

for (const [name, size] of targets) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, encodePng(size, size, drawIcon(size)));
  console.log(`✓ ${name} (${size}×${size}) → ${file}`);
}
console.log('\n提示：正式发行建议提供 1024×1024 的 build/icon.png（macOS 会转 .icns，Windows 会转 .ico）。');
