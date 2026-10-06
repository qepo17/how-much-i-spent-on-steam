# steam-purchases

A local dashboard for your own Steam account: every game you own, when you got it, what you paid, and where the money went. Exports to CSV.

It runs on your machine and only talks to Steam. Nothing is uploaded anywhere.

## What you get

- **Profile hero**: your avatar, name, Steam level, account age, and total spent on games
- **Highlights**: average price, biggest purchase, this year vs the same point last year, refunds
- **Charts**: spending by year, a month-by-month activity heatmap, how you got your games, payment methods, top tags. Click a year, month or tag to filter the library.
- **Biggest purchases**: your top checkouts with cover art
- **Library**: cover-art grid or table view, with search (names, bundles, developers, tags), price and source filters, and sorting. Click a game for its receipt, tags, release date and store links.
- **Purchase history**: every transaction (games, gifts, in-game, Market, refunds), filterable, including the ones that didn't match a game
- **Export**: CSV of the current view or everything, for both the library and the purchase history, plus a full JSON backup. CSVs open cleanly in Excel, Numbers and Google Sheets.
- **Playtime** (optional): hours played, last played, and cost per hour, if you add a Steam Web API key
- **Hide amounts**: the eye button (or press `H`) masks every amount on screen as `Rp •••••`, for screenshots, streaming or sharing your screen. Exports still contain real values.
- Dark and light themes, works on phones

## Setup

Requires Node 20.6 or newer.

```bash
npm install
cp .env.example .env
```

Get your cookie:

1. Log in at https://store.steampowered.com in your browser.
2. Open DevTools: **Application** tab in Chrome/Edge, **Storage** in Firefox. Go to **Cookies**, then `https://store.steampowered.com`.
3. Copy the value of `steamLoginSecure` into `.env`.

This cookie is as good as your password while it's valid. Keep `.env` private (it's already gitignored), and don't share `data/` or exported CSVs either.

**Optional: playtime.** Get a key at https://steamcommunity.com/dev/apikey and put it in `.env` as `STEAM_API_KEY`. Without it, everything except playtime still works.

## Use

```bash
npm run fetch   # takes a minute or two for a big history
npm start       # open http://localhost:3000
```

Re-run `npm run fetch` whenever you want fresh data. If it says you're logged out, the cookie has expired, so copy a new one.

To export without opening the dashboard:

```bash
npm run export                          # steam-library.csv
npm run export -- --history             # steam-purchase-history.csv
npm run export -- --out my-games.csv
```

## What it reads

From your account, using the cookie:

- **Licenses** (`store.steampowered.com/account/licenses`): every game you own and when you got it
- **Purchase history** (`store.steampowered.com/account/history`): dates, prices and payment methods
- **Owned apps and wishlist count** (`store.steampowered.com/dynamicstore/userdata`)

Public, no cookie sent:

- Your **community profile** (name, avatar, level, member since)
- **Store info** for the apps you own (cover art, developers, release date, tags) from Steam's store API

## How prices are matched

Licenses and purchase history are matched by name, or by purchase date for bundles.

- **Exact price**: the history line contains just that game, matched by name.
- **Bundle**: the game came in a bundle or a multi-game cart, so the app shows the purchase total rather than guessing a split.
- **Free**: free games, keys from other stores, gifts you received, and family-shared games.
- Totals use your most common currency. Purchases in other currencies are counted separately and noted under the chart.
- Turn on **Not matched to a game** in Purchase history to see what didn't line up: DLC named differently, gifts you sent, refunds.

Cover art is matched from the license name to the apps on your account. Names like "Icarus Free Weekend" or "EA SPORTS FC 26 Ultimate Edition" fall back to the longest app name they start with. Anything still unmatched (for example, an expired free weekend) gets a generated cover.

## When something looks off

Steam's pages aren't an official API, so the markup can change. Run:

```bash
npm run fetch:debug
```

This saves the raw pages to `data/raw/`, so you can check them against the selectors in `src/parse.js`. `npm test` runs the parser, matcher, stats and CSV code against fixtures.

## Project layout

```
fetch.js            pulls everything from Steam into data/library.json
server.js           serves public/ and data/library.json on localhost only
export.js           CSV export from the command line
src/steam.js        HTTP client for Steam
src/parse.js        HTML/XML parsing for licenses, history and profile
src/merge.js        matches licenses to purchases
src/enrich.js       matches licenses to store apps (art, tags, playtime)
public/             the dashboard (plain HTML, CSS and ES modules, no build step)
public/js/csv.js    CSV columns, shared by the dashboard and export.js
public/js/stats.js  totals and breakdowns behind the charts
```

---

Not affiliated with Valve. Steam and the Steam logo are trademarks of Valve Corporation.
