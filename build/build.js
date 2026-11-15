/* Stablecoin RSI build: turns the shared closed candles (repo mbzazad-max/market-data) into the saved snapshot the
   ORIGINAL page reads: the same documents its own "Refresh from TradingView" saves (snap/meta and snap/<id>-<part>).
   All of the dashboard's logic (RSI(7), swings, dates, levels, divergences, the weekly forecast) stays in the original
   page, which runs unchanged in the browser. This script only converts data, with the page's own rules:
     candles -> {t: [...], c: [...]} closes per source, in the page's SOURCES order (4H, 1D, 1W x USDT.D, USDC.D, BTCUSD)
     saved   -> parts of 1500 candles {t, c, part, parts, at}, closes rounded like the page's saveSource
                (|v| < 100: 5 decimals, else 2); meta {at, sources: {id: {at, rows, parts}}, failed, v: 1}
     counts  -> the page's own request sizes (4H 6,500, 1D 5,000, 1W 520), newest candles kept
   and the shared-data rules: closed candles only; BTC = stored Coinbase history then Binance BTCUSDT; USDT.D/USDC.D days
   after their stored daily history are made from 4H (a UTC day counts once its 20:00 candle has closed); weeks are Monday
   weeks of closed days (TradingView's weekly bars, identical).
   usage: node build/build.js <market-data dir> [--force]
   Writes public/snapshot.json and public/freshness.json. A source that cannot be built keeps its last good documents and
   is listed in meta.failed (the page shows "series ... kept from an older refresh"). Nothing is invented.
   If the inputs are unchanged since the last build (and not --force), nothing is rebuilt.
   The forecast history log (log/* documents) is carried over untouched; build/log.js adds new rows. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public');
const MD = path.resolve(process.argv[2] || '../market-data'), FORCE = process.argv.includes('--force');
const NOW = process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000);
const CHUNK = 1500;                                                     // the page's CHUNK
const SEC = { '4H': 14400, '1D': 86400, '1W': 604800 };

const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cfg = rd(path.join(ROOT, 'config', 'dashboard.json'));
const manifest = rd(path.join(MD, 'manifest.json')).series || {};
const prevSnap = fs.existsSync(path.join(PUB, 'snapshot.json')) ? rd(path.join(PUB, 'snapshot.json')) : { docs: {} };
const prevFresh = fs.existsSync(path.join(PUB, 'freshness.json')) ? rd(path.join(PUB, 'freshness.json')) : null;

// ---------- the page's own conversion rules ----------
const round = (v) => Math.abs(v) < 100 ? Math.round(v * 1e5) / 1e5 : Math.round(v * 100) / 100;   // the page's round()
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function csvFile(id) { const [src, sym, tf] = id.split('/'); return path.join(MD, 'data', src, `${sym}_${tf}.csv`); }
function load(id) {                                   // [{t, c}] oldest first; market-data stores closed candles only
  const f = csvFile(id); if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n'); lines.shift();
  return lines.map((ln) => { const p = ln.split(','); return { t: +p[0], c: +p[4] }; });
}
const after = (A, B) => { if (!A) return B; if (!B) return A; const lastT = A[A.length - 1].t; return A.concat(B.filter((r) => r.t > lastT)); };
// a stored history followed by a second series for every later candle (BTC: Coinbase history, then Binance BTCUSDT)
const chain = (first, then) => after(load(first), then ? load(then) : null);
function daysFrom4h(rows) {                           // a UTC day counts once its 20:00 candle (the day's last 4H) has closed
  if (!rows) return null;
  return rows.filter((r) => r.t % 86400 === 72000).map((r) => ({ t: r.t - 72000, c: r.c }));
}
function weekly(daily) {                              // Monday weeks; a week counts once its Sunday has closed
  const out = []; let cur = null;
  for (const r of daily) {
    const d = Math.floor(r.t / 86400) * 86400, wk = d - ((new Date(d * 1000).getUTCDay() + 6) % 7) * 86400;
    if (!cur || cur.t !== wk) { cur = { t: wk, c: r.c, sun: false }; out.push(cur); }
    cur.c = r.c; if (r.t === wk + 6 * 86400) cur.sun = true;
  }
  return out.filter((w) => w.sun).map((w) => ({ t: w.t, c: w.c }));
}
function check(rows, tf) {                            // anything a closed-candle series must never be
  if (!rows || !rows.length) throw new Error('no candles');
  const step = SEC[tf];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Number.isFinite(r.t) || !Number.isFinite(r.c) || r.c <= 0) throw new Error('bad value at ' + iso(r.t));
    if (tf !== '1W' && r.t % step !== 0) throw new Error('candle not on a ' + tf + ' boundary at ' + iso(r.t));
    if (i && r.t <= rows[i - 1].t) throw new Error('candles out of order at ' + iso(r.t));
    if (r.t + step > NOW) throw new Error('candle not closed yet at ' + iso(r.t));
  }
  for (let i = Math.max(1, rows.length - 60); i < rows.length; i++)
    if (Math.abs(rows[i].c / rows[i - 1].c - 1) > 0.5) throw new Error('impossible jump at ' + iso(rows[i].t));
  return rows;
}
function build(s) {
  let rows;
  if (s.use === '4H') rows = chain(s.series_4h, s.then_4h);
  else {
    const d = s.then_days_from_4h ? after(load(s.series), daysFrom4h(load(s.then_days_from_4h))) : chain(s.series, s.then);
    rows = s.use === '1W' ? weekly(check(d, '1D')) : d;
  }
  return check(rows, s.use).slice(-s.last);
}

// ---------- inputs and the skip check ----------
const used = new Set();
for (const s of Object.values(cfg.sources)) for (const k of ['series', 'series_4h', 'then', 'then_4h', 'then_days_from_4h']) if (s[k]) used.add(s[k]);
const inputs = [...used].sort().map((id) => [id, manifest[id] ? manifest[id].last_open + ':' + manifest[id].rows : 'missing']);
const FRESH_V = 2;                                    // freshness.json format (Market-Data series ids, read by Check dashboards)
const inputHash = crypto.createHash('sha256').update(JSON.stringify([inputs, cfg, FRESH_V])).digest('hex');
if (!FORCE && prevFresh && prevFresh.input_hash === inputHash) { console.log('No new closed candles since the last build; nothing rebuilt.'); process.exit(0); }

// ---------- build ----------
const at = new Date(NOW * 1000).toISOString();
const docs = {};
for (const [p, d] of Object.entries(prevSnap.docs || {})) if (p.startsWith('log/')) docs[p] = d;   // forecast log carried over
const sources = {}, failed = [], kept = [], series = [];
const prevMeta = (prevSnap.docs || {})['snap/meta'];
for (const [id, s] of Object.entries(cfg.sources)) {
  let rows;
  try { rows = build(s); }
  catch (e) {
    failed.push(id); kept.push({ id, why: String(e.message || e) });
    const info = prevMeta && prevMeta.sources && prevMeta.sources[id];
    if (info) { sources[id] = info; for (let k = 0; k < info.parts; k++) docs[`snap/${id}-${k}`] = prevSnap.docs[`snap/${id}-${k}`]; }
    continue;
  }
  const parts = Math.max(1, Math.ceil(rows.length / CHUNK));
  for (let k = 0; k < parts; k++) {
    const part = rows.slice(k * CHUNK, (k + 1) * CHUNK);
    docs[`snap/${id}-${k}`] = { t: part.map((r) => r.t), c: part.map((r) => round(r.c)), part: k, parts, at };
  }
  sources[id] = { at, rows: rows.length, parts };
}
// freshness: one entry per Market-Data series used, as read for this build (the format Check dashboards compares with
// Market-Data's manifest: same id, last_open and rows). Frozen series are stored history and are marked so.
const registry = fs.existsSync(path.join(MD, 'series.json')) ? (rd(path.join(MD, 'series.json')).series || {}) : {};
for (const sid of [...used].sort()) {
  const r = load(sid); if (!r || !r.length) continue;
  const [src, sym, tf] = sid.split('/'), m = manifest[sid] || {};
  series.push({ id: sid, source: src, symbol: sym.replace(/^CRYPTOCAP_/, ''), tf, period_s: SEC[tf], last_open: r[r.length - 1].t,
    last_close: r[r.length - 1].t + SEC[tf], fetched_at: m.fetched_at || null, rows: r.length, frozen: !!(registry[sid] && registry[sid].frozen) });
}
docs['snap/meta'] = { at, sources, failed, v: 1 };
const fresh = { generated: iso(NOW), checked_at: NOW, input_hash: inputHash, series, readings: [], kept,
  last_result: kept.length ? `${kept.length} source(s) kept their last good data.` : 'All sources built from closed candles.' };
fs.mkdirSync(PUB, { recursive: true });
fs.writeFileSync(path.join(PUB, 'snapshot.json'), JSON.stringify({ generated: at, docs }));
fs.writeFileSync(path.join(PUB, 'freshness.json'), JSON.stringify(fresh, null, 1));
console.log(`Built ${Object.keys(cfg.sources).length - failed.length}/${Object.keys(cfg.sources).length} sources at ${at}` + (failed.length ? `; kept last good: ${failed.join(', ')}` : ''));
for (const x of series) console.log(`  ${x.id.padEnd(24)} last closed candle ends ${iso(x.last_close)}  rows ${x.rows}${x.frozen ? '  (stored history, frozen)' : ''}`);
for (const k of kept) console.log(`  KEPT ${k.id}: ${k.why}`);
