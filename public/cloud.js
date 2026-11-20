/* Stablecoin RSI on Cloudflare: Refresh button (asks GitHub to rebuild from the newest shared data)
   and a freshness strip listing every data series and reading with how far behind it is. Uses the page's own styles. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // Controls live at /api/<slug>/ on the home site, which always needs the owner's login.
  var slug = location.pathname.split('/')[1] || '';
  var API = slug ? '/api/' + slug + '/' : 'api/';
  var row = document.querySelector('.rf-card .rf-status');
  var pill = document.createElement('span'); pill.className = 'rf-pill'; pill.id = 'runState'; pill.hidden = true;
  var btn = document.createElement('button'); btn.className = 'rf-btn'; btn.type = 'button'; btn.id = 'ghRefresh'; btn.textContent = 'Refresh'; btn.hidden = true;
  btn.title = 'Ask GitHub to rebuild the dashboard from the newest shared data (closed candles only)';
  if (row) { row.appendChild(pill); row.appendChild(btn); }
  var strip = document.createElement('div'); strip.className = 'rf-banner'; strip.id = 'fresh'; strip.hidden = true;
  var anchor = $('rfBanner'); if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(strip, anchor.nextSibling);

  var t2s = function (s) { if (!s) return '-'; var d = new Date(s * 1000); return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  var NAMES = {};
  function state(text, kind) { pill.hidden = false; pill.className = 'rf-pill ' + (kind || ''); pill.textContent = text; }

  function showFresh(F) {
    var now = Date.now() / 1000;
    var rows = F.series.filter(function (s) { return !s.frozen; }).map(function (s) {
      var behind = s.last_close ? Math.max(0, Math.floor((now - s.last_close) / s.period_s)) : null;
      var st = behind === null ? 'no data yet' : behind === 0 ? 'current' : behind + ' candle' + (behind > 1 ? 's' : '') + ' behind';
      return { label: esc(s.symbol + ' ' + s.tf) + ' <span style="opacity:.75">(' + esc(s.source) + ')</span>', when: t2s(s.last_close), st: st, flag: behind === null || behind > 1 };
    }).concat((F.readings || []).map(function (r) {
      var age = r.fetched_at ? (now - r.fetched_at) / 3600 : null;
      return { label: esc(NAMES[r.id] || r.id), when: t2s(r.fetched_at), st: age === null ? 'no reading yet' : Math.round(age) + ' h old', flag: age === null || age > 30 };
    }));
    var flagged = rows.filter(function (r) { return r.flag; });
    var head = 'Built ' + esc(F.generated) + ' · last check ' + esc(t2s(F.checked_at)) + ' · ' + rows.length + ' inputs, ' +
      (flagged.length ? '<b>' + flagged.length + ' behind</b>' : 'all current');
    if (F.kept && F.kept.length) head += ' · kept last good: ' + F.kept.map(function (k) { return esc(k.id); }).join(', ');
    var body = rows.map(function (r) { return '<tr' + (r.flag ? ' style="font-weight:600"' : '') + '><td style="padding-right:16px">' + r.label + '</td><td style="padding-right:16px">' + esc(r.when) + '</td><td>' + esc(r.st) + '</td></tr>'; }).join('');
    var kept = (F.kept || []).map(function (k) { return '<li>' + esc(k.id) + ': ' + esc(k.why) + '</li>'; }).join('');
    strip.hidden = false;
    strip.className = 'rf-banner' + (flagged.length ? '' : ' ok');
    strip.innerHTML = '<details><summary>' + head + '</summary>' +
      (kept ? '<p style="margin:8px 0 4px">These show their last good version:</p><ul style="margin:0 0 8px">' + kept + '</ul>' : '') +
      '<table style="margin-top:8px;border-collapse:collapse;font-size:12.5px"><thead><tr><th style="text-align:left">Input</th><th style="text-align:left">Last closed candle / reading (your time)</th><th style="text-align:left">Status</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<p style="margin:8px 0 0">' + esc(F.last_result || '') + ' Only closed candles are used, all from Market-Data. BTC: the stored Coinbase BTCUSD history, then your Binance BTCUSDT upload. USDT.D and USDC.D: the daily 11:30 TradingView load (4H); days after their stored daily history are made from those 4H candles, and weeks from the days.</p></details>';
  }
  function loadFresh() {
    return fetch('freshness.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (F) { if (F) showFresh(F); }).catch(function () {});
  }

  var polling = null;
  function poll(startedAt) {
    clearTimeout(polling);
    fetch(API + 'status', { cache: 'no-store', redirect: 'manual', credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('no access'); return r.json(); }).then(function (s) {
      btn.hidden = false;
      if (s.status && s.status !== 'completed' && s.status !== 'none') { state('Running…', 'warn'); btn.disabled = true; polling = setTimeout(function () { poll(startedAt || Date.now()); }, 8000); return; }
      btn.disabled = false;
      if (!startedAt) return;
      if (s.conclusion === 'success') { state('Done ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'ok'); setTimeout(function () { location.reload(); }, 1500); }
      else state('Refresh failed, last good data kept', 'warn');
    }).catch(function () { btn.disabled = false; if (startedAt) state('Could not check progress', 'warn'); else btn.hidden = true; });
  }
  btn.addEventListener('click', function () {
    btn.disabled = true; state('Starting…', '');
    fetch(API + 'refresh', { method: 'POST', redirect: 'manual', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function () { state('Running…', 'warn'); setTimeout(function () { poll(Date.now()); }, 5000); })
      .catch(function (e) { btn.disabled = false; state('Refresh not started: ' + e.message, 'warn'); });
  });
  loadFresh();
  poll(0);
})();

/* "← Dashboards" link back to the home site, same as the Data check page. Added on Cloudflare only; the page itself is unchanged. */
(function () {
  'use strict';
  var st = document.createElement('style');
  st.textContent = '.dash-back{display:inline-block;font-size:13px;line-height:1.4;color:var(--muted,var(--color-fg-muted,#586878));text-decoration:none;white-space:nowrap}' +
    '.dash-back:hover{text-decoration:underline}.dash-back-row{margin:0 0 6px}';
  document.head.appendChild(st);
  var a = document.createElement('a'); a.className = 'dash-back'; a.href = '/'; a.textContent = '← Dashboards';
  a.title = 'Back to the list of dashboards';
  var host = document.body.firstElementChild;
  while (host && (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TITLE|TEMPLATE)$/.test(host.tagName) || getComputedStyle(host).display === 'none')) host = host.nextElementSibling;
  var row = document.createElement('div'); row.className = 'dash-back-row'; row.appendChild(a);
  if (host && host.classList.contains('fx-bar')) { a.style.marginRight = '6px'; host.insertBefore(a, host.firstChild); }
  else if (host) host.insertBefore(row, host.firstChild);
  else document.body.insertBefore(row, document.body.firstChild);
})();

/* View switch (owner, 20 Nov 2026): "USDT.D + USDC.D" (the original page) or "USDT.D only". The USDT.D only view loads
   snapshot_usdt.json (shim.js), in which USDC.D is zero, so the page's own unchanged logic runs on USDT.D alone; the page's
   labels are rewritten from "USDT.D + USDC.D" to "USDT.D" on screen. Study figures quoted in the page text were measured on
   USDT.D + USDC.D. The view keeps its own forecast history, starting 20 Nov 2026. */
(function () {
  'use strict';
  var usdt = /[?&]view=usdt\b/.test(location.search);
  var st = document.createElement('style');
  st.textContent = '.vw-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 8px;font-size:13px}' +
    '.vw-row a{padding:3px 10px;border:1px solid var(--line,#d0d7de);border-radius:999px;text-decoration:none;color:inherit}' +
    '.vw-row a[aria-current]{background:var(--fg,#1f2328);color:var(--bg,#fff);border-color:transparent}' +
    '.vw-note{font-size:12px;opacity:.8;margin:0 0 8px}';
  document.head.appendChild(st);
  var row = document.createElement('div'); row.className = 'vw-row';
  row.innerHTML = '<span>View:</span><a href="./"' + (usdt ? '' : ' aria-current="page"') + '>USDT.D + USDC.D</a><a href="./?view=usdt"' + (usdt ? ' aria-current="page"' : '') + '>USDT.D only</a>';
  var back = document.querySelector('.dash-back-row') || document.querySelector('.dash-back');
  var host = back ? (back.classList.contains('dash-back-row') ? back : back.parentNode) : document.body.firstElementChild;
  host.parentNode.insertBefore(row, host.nextSibling);
  if (!usdt) return;
  var note = document.createElement('p'); note.className = 'vw-note';
  note.textContent = 'USDT.D only: every card uses the same rules on USDT.D alone (USDC.D left out). Hit rates and study figures quoted in the text were measured on USDT.D + USDC.D. Forecast history for this view starts 20 Nov 2026.';
  row.parentNode.insertBefore(note, row.nextSibling);
  var RX = [[/USDT\.D\s*\+\s*USDC\.D/g, 'USDT.D'], [/USDT\s*\+\s*USDC/g, 'USDT'], [/USDT\.D\+USDC\.D/g, 'USDT.D']];
  var fix = function (n) {
    if (n.nodeType === 3) { var v = n.nodeValue, w = v; RX.forEach(function (r) { w = w.replace(r[0], r[1]); }); if (w !== v) n.nodeValue = w; return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.tagName) || n === note || n === row) return;
    for (var c = n.firstChild; c; c = c.nextSibling) fix(c);
  };
  fix(document.body); document.title = document.title.replace(/USDT\.D\s*\+\s*USDC\.D/g, 'USDT.D');
  new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === 'characterData') fix(m.target); else m.addedNodes.forEach(fix); }); })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
})();
