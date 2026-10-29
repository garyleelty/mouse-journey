'use strict';
/**
 * 由真实渲染层生成检查用 harness 页面：
 *   node .taste-skill/gen-harness.cjs  →  .taste-skill/harness/index.html
 * 规则：拷贝 src/renderer/index.html，把相对路径指回 src/，并在 geo.js 前插入 mock-api.js。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');

let out = src
  .replace('href="css/main.css"', 'href="../../src/renderer/css/main.css"')
  .replace(/src="js\//g, 'src="../../src/renderer/js/')
  .replace(/src="\.\.\/shared\//g, 'src="../../src/shared/');

const marker = '<script src="../../src/shared/geo.js"></script>';
if (!out.includes(marker)) {
  console.error('未找到 geo.js 脚本标记，请检查 src/renderer/index.html');
  process.exit(1);
}
out = out.replace(marker, '<script src="mock-api.js"></script>\n  ' + marker);

fs.writeFileSync(path.join(__dirname, 'harness/index.html'), out);
console.log('harness/index.html 生成完成');
