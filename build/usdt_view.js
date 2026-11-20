/* "USDT.D only" view (owner, 20 Nov 2026). The original page always works on USDT.D + USDC.D. To show every card on
   USDT.D alone with the page's own, unchanged logic, this writes public/snapshot_usdt.json: the same documents as
   public/snapshot.json, except that each USDC.D source (C_4h, C_1d, C_1w) carries the USDT.D candle times with a close
   of 0. The page's sum is then USDT.D itself, candle for candle, over USDT.D's full history. BTC is unchanged.
   The view keeps its own forecast history (log/* in snapshot_usdt.json, extended by build/log.js with
   SNAP=public/snapshot_usdt.json); it starts on 20 Nov 2026.
   usage: node build/usdt_view.js   (after build/build.js) */
'use strict';
const fs = require('fs'), path = require('path');
const PUB = path.resolve(__dirname, '..', 'public');
const src = JSON.parse(fs.readFileSync(path.join(PUB, 'snapshot.json'), 'utf8'));
const outP = path.join(PUB, 'snapshot_usdt.json');
const prev = fs.existsSync(outP) ? JSON.parse(fs.readFileSync(outP, 'utf8')) : { docs: {} };
const docs = {};
for (const [k, v] of Object.entries(src.docs)) {
  if (k.startsWith('log/')) continue;                 // the combined view's log is not this view's
  if (/^snap\/C_/.test(k)) continue;                  // rebuilt below from the USDT.D documents
  docs[k] = v;
}
const meta = JSON.parse(JSON.stringify(src.docs['snap/meta']));
for (const tf of ['4h', '1d', '1w']) {
  const T = 'T_' + tf, C = 'C_' + tf;
  for (const [k, v] of Object.entries(src.docs)) {
    if (!k.startsWith('snap/' + T + '-')) continue;
    docs['snap/' + C + k.slice(('snap/' + T).length)] = Object.assign({}, v, { c: v.c.map(() => 0) });
  }
  if (meta.sources[T]) meta.sources[C] = Object.assign({}, meta.sources[T]);
}
docs['snap/meta'] = meta;
for (const [k, v] of Object.entries(prev.docs || {})) if (k.startsWith('log/')) docs[k] = v;
const out = Object.assign({}, src, { docs, view: 'USDT.D only' });
fs.writeFileSync(outP, JSON.stringify(out));
console.log('USDT.D only view: ' + Object.keys(docs).length + ' documents, ' + Object.keys(docs).filter((k) => k.startsWith('log/')).length + ' log cards kept.');
