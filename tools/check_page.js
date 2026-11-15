/* The page must be the original Stablecoin RSI artifact ("Stablecoin RSI Forecast"), unchanged.
   1. reference/index.original.html must match reference/PAGE_SHA256SUMS (the published artifact page as written, version 1794646047, read 15 Nov 2026).
   2. public/index.html must be exactly: reference/artifact_wrapper.html (the head claude.ai's artifact host puts around every
      page: UTF-8, mobile viewport, "hidden" really hides) + that file + the two added script tags
      (shim.js before the page's first script, cloud.js at the end).
   usage: node tools/check_page.js          (exit 1 on any difference)
          node tools/check_page.js --write  (writes public/index.html from the reference; only needed after a deliberate page update) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const ref = fs.readFileSync(path.join(ROOT, 'reference/index.original.html'));
const want = fs.readFileSync(path.join(ROOT, 'reference/PAGE_SHA256SUMS'), 'utf8').trim().split(/\s+/)[0];
const got = crypto.createHash('sha256').update(ref).digest('hex');
if (got !== want) { console.error('reference/index.original.html changed: ' + got + ' != ' + want); process.exit(1); }
const FIRST = '<script>\n/* ---------- calculations and rendering ---------- */';
const page = ref.toString('utf8');
if (page.split(FIRST).length !== 2) { console.error('could not find the page\'s first script'); process.exit(1); }
const WRAP = fs.readFileSync(path.join(ROOT, 'reference/artifact_wrapper.html'), 'utf8');
const expected = WRAP + page.replace(FIRST, '<script src="shim.js"></script>\n' + FIRST) + '\n<script src="cloud.js"></script>\n';
const out = path.join(ROOT, 'public/index.html');
if (process.argv.includes('--write')) fs.writeFileSync(out, expected);
if (fs.readFileSync(out, 'utf8') !== expected) { console.error('public/index.html is not the original page plus shim.js and cloud.js'); process.exit(1); }
console.log('Page unchanged (original artifact + shim.js + cloud.js): ' + got);
