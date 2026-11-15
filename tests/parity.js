/* Parity: the original artifact page's own "Refresh from TradingView" vs build/build.js, on identical candles.
   1. The original page (reference/, no shim) runs in jsdom with a stand-in claude.ai database and a stand-in TradingView
      connector that answers each request with exactly the Market-Data candles build.js used for that series (USDT.D,
      USDC.D and BTCUSD on 4H, 1D and 1W, the page's own requests). Its own Refresh runs.
   2. Every document it saves (snap/meta and snap/<id>-<part>) must equal the one in public/snapshot.json
      (the save time "at" aside).
   3. The page's own forecasts() (every card, including the 8H and 3D ones the page derives itself: RSI, next level, expected candle, range, trigger) must be identical on both.
   usage: node tests/parity.js <node_modules dir with jsdom>   (after build/build.js) */
'use strict';
const fs = require('fs'), path = require('path');
const NM = path.resolve(process.argv[2] || 'node_modules');
const { JSDOM } = require(path.join(NM, 'jsdom'));
const ROOT = path.resolve(__dirname, '..');
const built = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/snapshot.json'), 'utf8')).docs;
const META = built['snap/meta'];
const strip = (d) => { const o = JSON.parse(JSON.stringify(d)); delete o.at; return o; };
const series = {};
for (const id of Object.keys(META.sources)) { const t = [], c = []; for (let k = 0; k < META.sources[id].parts; k++) { t.push(...built[`snap/${id}-${k}`].t); c.push(...built[`snap/${id}-${k}`].c); } series[id] = { t, c }; }

function memDb(seed) {
  const docs = JSON.parse(JSON.stringify(seed || {})), subs = {};
  const snap = (p) => ({ exists: docs[p] != null, data: () => (docs[p] == null ? undefined : JSON.parse(JSON.stringify(docs[p]))) });
  return { docs, doc: (p) => ({
    get: async () => snap(p),
    set: async (d) => { docs[p] = JSON.parse(JSON.stringify(d)); (subs[p] || []).forEach((f) => setTimeout(() => f(snap(p)), 0)); },
    onSnapshot: (f) => { (subs[p] = subs[p] || []).push(f); setTimeout(() => f(snap(p)), 0); return () => {}; } }) };
}
function open(html, claude) {
  const dom = new JSDOM(html.replace(/<link[^>]+>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://test.local/', beforeParse(w) {
    if (claude) w.claude = claude; else w.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify({ docs: built })) });
    w.setTimeout = ((st) => (f, ms, ...a) => st(f, Math.min(ms || 0, 5), ...a))(w.setTimeout.bind(w));   // no 1.5 s pauses between calls
  } });
  return dom.window;
}
const wait = (w, ok, what) => new Promise((res, rej) => { let n = 0; const t = () => { let v; try { v = ok(); } catch (e) { v = false; } if (v) return res(v); if (++n > 600) return rej(new Error('timed out: ' + what)); setTimeout(t, 100); }; t(); });

(async () => {
  // 1. original page, its own Refresh
  const ref = fs.readFileSync(path.join(ROOT, 'reference/artifact_wrapper.html'), 'utf8') + fs.readFileSync(path.join(ROOT, 'reference/index.original.html'), 'utf8');
  const db = memDb({ 'snap/meta': { at: '2000-01-01T00:00:00Z', sources: {}, failed: [], v: 1 } });
  let calls = 0;
  const SYM = { 'CRYPTOCAP:USDT.D': 'T', 'CRYPTOCAP:USDC.D': 'C', 'COINBASE:BTCUSD': 'B' };
  const IV = { '4h': '4h', '1D': '1d', '1W': '1w' };
  const mcp = { callTool: async (server, tool, args) => { calls++; const s = series[SYM[args.symbol] + '_' + IV[args.interval]]; if (!s) throw { code: 'tool_error', message: 'unknown ' + args.symbol }; return { payload: { success: true, bars: { t: s.t, c: s.c } } }; } };
  const claude = { use: async (k) => (k === 'db' ? db : k === 'user' ? { isOwner: async () => true, canEdit: async () => true } : k === 'mcp' ? mcp : null) };
  const w1 = open(ref, claude);
  await wait(w1, () => !w1.document.getElementById('rfBtn').hidden, 'Refresh button');
  w1.document.getElementById('rfBtn').click();
  await wait(w1, () => calls === Object.keys(series).length && /updated and saved/.test(w1.document.getElementById('rfBanner').textContent), 'page Refresh to finish');
  let bad = 0, n = 0;
  for (const [p, d] of Object.entries(built)) {
    if (!p.startsWith('snap/')) continue; n++;
    const mine = p === 'snap/meta' ? { failed: d.failed, sources: Object.fromEntries(Object.entries(d.sources).map(([k, v]) => [k, strip(v)])) } : strip(d);
    const page = db.docs[p] == null ? null : p === 'snap/meta' ? { failed: db.docs[p].failed, sources: Object.fromEntries(Object.entries(db.docs[p].sources).map(([k, v]) => [k, strip(v)])) } : strip(db.docs[p]);
    if (JSON.stringify(mine) !== JSON.stringify(page)) { bad++; console.log('DIFFERENT: ' + p); }
  }
  console.log(`Saved documents: ${n - bad} of ${n} identical (original page's own Refresh vs build.js).`);
  // 2. forecasts on both pages
  const f1 = JSON.stringify(w1.__src.forecasts());
  const pub = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8').replace('<script src="shim.js"></script>', () => '<script>' + fs.readFileSync(path.join(ROOT, 'public/shim.js'), 'utf8') + '</script>').replace('<script src="cloud.js"></script>', '');
  const w2 = open(pub, null);
  await wait(w2, () => w2.__src && Object.keys(META.sources).every((id) => w2.__src.RAW[id]) && w2.document.getElementById('cards').innerHTML.length, 'Cloudflare page');
  const f2 = JSON.stringify(w2.__src.forecasts());
  const same = f1 === f2;
  console.log(`Forecasts on every card (${JSON.parse(f1).length}): ${same ? 'identical' : 'DIFFERENT'}.`);
  w1.close(); w2.close();
  process.exit(bad || !same ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
