# Stablecoin RSI

The Claude artifact "Stablecoin RSI Forecast" (https://claude.ai/artifact/RwhD7xX5fbguMsi9BmNVST), rebuilt on GitHub and
shown on Cloudflare. Claude only loads data; the original page does all the logic. Statistical estimates from past
behaviour, not financial advice.

- **Address**: none of its own (`workers_dev: false`). It opens at https://dashboards.mbzazad.workers.dev/stablecoin-rsi/
  behind the home site's owner-only login. Refresh controls are at `/api/stablecoin-rsi/`, always behind the login.
- **Page**: `public/index.html` is the artifact page (version 1794646047, read 15 Nov 2026), byte-identical, plus two
  script tags: `shim.js` (feeds the page's own data store from `snapshot.json`, read-only) and `cloud.js` (Refresh
  button and freshness strip). The original is `reference/index.original.html`; every run checks it against
  `reference/PAGE_SHA256SUMS` (`node tools/check_page.js`).
- **Data** (all from `mbzazad-max/market-data`, closed candles only; map in `config/dashboard.json`):

  | Page input | Market-Data series |
  |---|---|
  | BTCUSD 4H | `tv/COINBASE_BTCUSD/4H` (stored history, frozen) then `binance/BTCUSDT/4H` (laptop UPLOAD.bat) |
  | BTCUSD 1D, 1W | `tv/COINBASE_BTCUSD/1D` (frozen) then `binance/BTCUSDT/1D`; weeks from closed days |
  | USDT.D, USDC.D 4H | `tv/CRYPTOCAP_USDT.D/4H`, `tv/CRYPTOCAP_USDC.D/4H` (daily 11:30 TradingView task) |
  | USDT.D, USDC.D 1D, 1W | `tv/CRYPTOCAP_USDT.D/1D`, `tv/CRYPTOCAP_USDC.D/1D` (frozen history, TradingView answer of 13 Nov 2026), then days made from the 4H series (a UTC day counts once its 20:00 candle has closed); weeks from closed days |

  The page asks for the same things in its own Refresh (4H x6,500, 1D x5,000, 1W x520) and works out 8H and 3D itself.
  Weeks are Monday weeks, identical to TradingView's weekly bars. No TradingView calls are made by this repo.
- **Build**: `build/build.js` writes exactly the documents the page's own "Refresh from TradingView" saves
  (`public/snapshot.json`: `snap/meta`, `snap/<id>-<part>`; same order, sizes, parts of 1,500 and rounding) and
  `public/freshness.json`. If no input changed, nothing is rebuilt. A source that cannot be built keeps its last good
  data and is listed (the page shows it as kept from an older refresh).
- **Forecast history log**: on claude.ai the page added a row per card for each new closed candle when it was opened.
  Here `build/log.js` runs the original page in jsdom after each build and applies the page's own rule (only when every
  source built cleanly; one row per new candle; latest 120 kept). The artifact's log was carried over on 15 Nov 2026.
- **Runs** (`.github/workflows/build.yml`): when Market-Data imports new candles for a series it uses (dispatch), daily
  at 01:15 UTC as a safety net after the 11:30/11:40 loads, from the Refresh button, and on a push to main.
  Steps: checksum check, secret check, checkout market-data with MARKET_DATA_TOKEN, build, log, commit, deploy.

**Tests** (jsdom 24 in some folder; Playwright with Chromium for the render test):
- `node tests/parity.js <node_modules>`: the ORIGINAL page's own Refresh in jsdom, answered with the same Market-Data
  candles, vs build.js. 15 Nov 2026: all 21 saved documents identical; the forecasts on all 5 cards (4H, 8H, 1D, 3D, 1W)
  identical.
- `node tests/render.js`: the page in Chromium at desktop and phone width: no errors, no undefined/NaN, nothing past
  a card's border, no sideways scroll.
- Data check, 15 Nov 2026: compared with the artifact's own TradingView data, USDT.D and USDC.D are identical on 4H,
  1D and 1W; BTCUSD is identical up to 13 Nov and about 0.11% apart after it (Coinbase BTCUSD vs Binance BTCUSDT,
  the intended switch).

**Secrets** (repo Settings → Secrets and variables → Actions → Repository secrets): `MARKET_DATA_TOKEN` (token A,
"coin-zones automation"; it also becomes the Worker's GITHUB_TOKEN for the Refresh button), `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID` (32 characters).
