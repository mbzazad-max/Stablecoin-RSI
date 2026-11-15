/* Stablecoin RSI on Cloudflare: read-only stand-in for the claude.ai page database.
   The original page reads its saved snapshot ("snap/..."), scheduled updates ("patch/...") and forecast log ("log/...")
   from the claude.ai database. Here the same documents arrive fully built in snapshot.json (built on GitHub from closed
   candles), so the page's own code renders every card exactly as before. Nothing can be written from the page, and there
   is no TradingView connector here, so the page's own "Refresh from TradingView" button stays hidden; cloud.js adds a
   Refresh button that asks GitHub to rebuild instead. The forecast log is extended on GitHub (build/log.js). */
(function () {
  'use strict';
  var all = null;
  function load() {
    if (!all) all = fetch('snapshot.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    return all;
  }
  function snap(docs, p) { var d = docs[p]; return { id: p.split('/').pop(), exists: d != null, data: function () { return d == null ? undefined : JSON.parse(JSON.stringify(d)); }, metadata: {} }; }
  var RO = new Error('This dashboard is read-only; it is rebuilt on GitHub.');
  var DB = {
    doc: function (p) {
      return {
        get: function () { return load().then(function (s) { return snap(s.docs, p); }); },
        onSnapshot: function (next, fail) {
          load().then(function (s) { next(snap(s.docs, p)); }, function (e) { if (fail) fail(e); });
          return function () {};
        },
        set: function () { return Promise.reject(RO); }
      };
    },
    collection: function () { return { get: function () { return Promise.resolve({ docs: [] }); } }; }
  };
  var USER = { isOwner: function () { return Promise.resolve(false); }, canEdit: function () { return Promise.resolve(false); } };
  window.claude = { use: function (k) { return Promise.resolve(k === 'db' ? DB : k === 'user' ? USER : null); } };
})();
