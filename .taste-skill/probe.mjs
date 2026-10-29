// 用法：node .taste-skill/probe.mjs "<url#tab>" "<页面内函数体，返回 JSON>"
// 例：node .taste-skill/probe.mjs "http://127.0.0.1:8899/.taste-skill/harness/index.html#achv" "return document.title"
import { Browser } from '/tmp/taste-skill/skills/taste-skill/scripts/lib/cdp.mjs';

const url = process.argv[2];
const body = process.argv[3] || 'return document.title';
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);

const browser = await Browser.launch({ width, height });
try {
  const page = await browser.newPage({ width, height });
  await page.goto(url, { settleMs: 800 });
  const out = await page.eval(new Function(body));
  console.log(JSON.stringify(out, null, 1));
  if (page.consoleErrors.length) console.log('PAGE ERRORS:', page.consoleErrors);
} finally {
  await browser.close();
}
