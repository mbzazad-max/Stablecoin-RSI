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
    var rows = F.series.map(function (s) {
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
