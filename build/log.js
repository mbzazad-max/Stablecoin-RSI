/* Forecast history log, extended on GitHub. On claude.ai the page added one row per card for each new closed candle
   whenever it was opened (its logNow). On Cloudflare the page cannot save anything, so after every build this script runs
   the original page in jsdom on the new snapshot and applies the page's own rule:
     - only when every series loaded cleanly (snap/meta "failed" is empty), as the page requires;
     - for each card, take the page's own forecasts() entry; add it only if its candle is newer than the last row;
     - keep the latest 120 rows per card (the page's LOGMAX).
   The rows are the page's own numbers; nothing is calculated here.
   usage: node build/log.js <node_modules dir with jsdom>   (after build/build.js; edits public/snapshot.json)
   If anything fails, the snapshot is left exactly as build.js wrote it and the script exits 0 with a warning. */
'use strict';
const fs = require('fs'), path = require('path');
const NM = path.resolve(process.argv[2] || 'node_modules');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public'), SNAP = path.join(PUB, 'snapshot.json');
const LOGMAX = 120;

function pageForecasts(snapshot) {
  const { JSDOM } = require(path.join(NM, 'jsdom'));
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
    .replace('<script src="shim.js"></script>', () => '<script>' + fs.readFileSync(path.join(PUB, 'shim.js'), 'utf8') + '</script>')
    .replace('<script src="cloud.js"></script>', '').replace(/<link[^>]+>/g, '');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://build.local/stable-rsi-clock/', beforeParse(w) {
    w.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(snapshot)) });
  } });
  const w = dom.window, ids = Object.keys(snapshot.docs['snap/meta'].sources);
  return new Promise((resolve, reject) => {
    let tries = 0;
    const tick = () => {
      const S = w.__src, ready = S && ids.every((id) => S.RAW[id]) && w.document.getElementById('cards').innerHTML.length > 0;
      if (!ready) { if (++tries > 150) { w.close(); return reject(new Error('the page did not load the snapshot')); } return setTimeout(tick, 100); }
      try { const f = S.forecasts(); w.close(); resolve(JSON.parse(JSON.stringify(f))); } catch (e) { w.close(); reject(e); }
    };
    tick();
  });
}

(async () => {
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8')), meta = snap.docs['snap/meta'];
  if (!meta) { console.log('::warning::No snapshot meta; log not extended.'); return; }
  if ((meta.failed || []).length) { console.log('::warning::Some series kept an older version (' + meta.failed.join(', ') + '); the log is not extended, as on the original page.'); return; }
  let added = 0;
  for (const { key, e } of await pageForecasts(snap)) {
    const doc = snap.docs['log/' + key] || { rows: [] }, rows = doc.rows || [];
    const last = rows[rows.length - 1];
    if (last && last.c >= e.c) continue;
    snap.docs['log/' + key] = { rows: rows.concat([e]).slice(-LOGMAX) }; added++;
  }
  fs.writeFileSync(SNAP, JSON.stringify(snap));
  console.log(`Forecast log: ${added} new row${added === 1 ? '' : 's'}.`);
})().catch((e) => { console.log('::warning::Forecast log not extended: ' + (e && e.message || e)); process.exit(0); });
