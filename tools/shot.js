// 一張指令截圖：node tools/shot.js <url> <out.png> [waitMs]
// 用本機 Chrome（puppeteer-core，不下載瀏覽器），等載入＋額外等待後再拍
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2];
const out = process.argv[3] || 'shot.png';
const waitMs = parseInt(process.argv[4] || '4000', 10);

if (!url) {
  console.error('用法: node tools/shot.js <url> <out.png> [waitMs]');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await new Promise((r) => setTimeout(r, waitMs));
    await page.screenshot({ path: out });
    console.log('OK', out);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
