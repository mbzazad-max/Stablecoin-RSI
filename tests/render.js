/* Render: the Cloudflare page in a real browser (Playwright Chromium), served from public/ as the Worker serves it.
   Every tab at desktop and phone width: no script errors, no "undefined"/"NaN", no card content past its border,
   no sideways page scroll. Screenshots go to tests/out/.
   usage: node tests/render.js   (needs the playwright package with Chromium) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const PUB = path.resolve(__dirname, '../public'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/stablecoin-rsi\//, '/');
  if (p.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); }
  if (p === '/') p = '/index.html';
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/stablecoin-rsi/`;
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); let bad = 0;
  for (const [w, name] of [[1300, 'desktop'], [400, 'phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(url); await p.waitForFunction(() => document.getElementById('cards').innerHTML.length > 0, null, { timeout: 20000 });
    for (const tab of await p.$$eval('#tabs button', (bs) => bs.map((x) => x.dataset.v))) {
      await p.click(`#tabs button[data-v="${tab}"]`); await p.waitForTimeout(150);
      const r = await p.evaluate(() => ({
        nan: /undefined|NaN/.test(document.getElementById('cards').innerText),
        over: [...document.querySelectorAll('.card *')].filter((e) => { const c = e.closest('.card').getBoundingClientRect(), x = e.getBoundingClientRect(); return !e.closest('.scroll') && x.width > 0 && x.right > c.right + 1; }).length,
        hscroll: document.documentElement.scrollWidth > innerWidth, cards: document.querySelectorAll('.card').length }));
      const ok = !r.nan && !r.over && !r.hscroll && r.cards === 5;   // 4H, 8H, 1D, 3D, 1W
      if (!ok) bad++;
      console.log(`${name.padEnd(7)} ${tab}: ${r.cards} cards, ${r.nan ? 'undefined/NaN shown' : 'values ok'}, ${r.over} overflowing, ${r.hscroll ? 'scrolls sideways' : 'fits'}${ok ? '' : '  <-- PROBLEM'}`);
      if (tab === 'U') await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
    }
    if (errs.length) { bad++; console.log(name + ' script errors: ' + errs.join(' | ')); }
    await p.close();
  }
  await b.close(); server.close();
  console.log(bad ? `${bad} problem(s).` : 'Render OK.');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
