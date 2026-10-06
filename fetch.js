import { mkdir, writeFile } from 'node:fs/promises';
import { createSteamClient, NotLoggedInError, steamIdFromCookie } from './src/steam.js';
import { parseHistoryRows, parseLicenses, parseProfileLevel, parseProfileXml } from './src/parse.js';
import { merge } from './src/merge.js';
import { enrichGames, toAppInfo } from './src/enrich.js';

const OUT_DIR = 'data';
const DEBUG_DIR = process.argv.includes('--debug') ? `${OUT_DIR}/raw` : null;

const loginSecure = process.env.STEAM_LOGIN_SECURE?.trim();
if (!loginSecure) {
  console.error('STEAM_LOGIN_SECURE is empty. Copy .env.example to .env and paste your steamLoginSecure cookie in.');
  process.exit(1);
}

const apiKey = process.env.STEAM_API_KEY?.trim() || null;
const steamId = steamIdFromCookie(loginSecure);
const steam = createSteamClient({ loginSecure, debugDir: DEBUG_DIR, log: (m) => console.log(m) });

/** Profile, art and playtime are extras: if Steam refuses one, keep going with the purchase data. */
async function optional(label, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof NotLoggedInError) throw err;
    console.warn(`  Skipped ${label}: ${err.message}`);
    return null;
  }
}

async function loadProfile(userData) {
  if (!steamId) return null;
  const profile = parseProfileXml(await steam.fetchProfileXml(steamId));
  if (!profile) return null;
  const level = await optional('Steam level', async () => parseProfileLevel(await steam.fetchProfileHtml(steamId)));
  return {
    ...profile,
    level,
    ownedAppCount: userData?.ownedAppIds.length ?? null,
    wishlistCount: userData?.wishlistCount ?? null,
  };
}

async function loadApps(userData) {
  if (!userData?.ownedAppIds.length) return [];
  const [items, tagNames] = await Promise.all([
    steam.fetchStoreItems(userData.ownedAppIds),
    optional('tag names', () => steam.fetchTagNames()),
  ]);
  return items.map((item) => toAppInfo(item, tagNames ?? undefined));
}

async function loadPlaytimes() {
  if (!apiKey || !steamId) return new Map();
  const owned = await steam.fetchOwnedGames(apiKey, steamId);
  return new Map(owned.map((g) => [g.appid, g]));
}

try {
  console.log('Loading licenses…');
  const licenses = parseLicenses(await steam.fetchLicensesHtml());
  console.log(`  ${licenses.length} licenses`);

  console.log('Loading purchase history…');
  const history = (await steam.fetchHistoryHtml()).flatMap(parseHistoryRows);
  console.log(`  ${history.length} history rows`);

  if (!licenses.length || !history.length) {
    console.warn(
      '\nOne of the pages parsed to zero rows. Steam may have changed its markup.\n' +
        'Run `npm run fetch:debug` and check the HTML saved in data/raw/.'
    );
  }

  console.log('Loading profile, cover art and tags…');
  const userData = await optional('owned apps', () => steam.fetchUserData());
  const profile = await optional('profile', () => loadProfile(userData));
  const apps = (await optional('store info', () => loadApps(userData))) ?? [];
  const playtimes = (await optional('playtime', loadPlaytimes)) ?? new Map();

  const merged = merge(licenses, history);
  const games = enrichGames(merged.games, apps, playtimes);
  const { unlinkedPurchases } = merged;
  const withPrice = games.filter((g) => g.price != null).length;
  const withArt = games.filter((g) => g.app).length;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    `${OUT_DIR}/library.json`,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), profile, hasPlaytime: playtimes.size > 0, games, unlinkedPurchases, history },
      null,
      2
    )
  );

  console.log(`\nSaved ${games.length} games (${withPrice} with a price, ${withArt} with store info) to ${OUT_DIR}/library.json`);
  console.log('Run `npm start` to browse them.');
} catch (err) {
  console.error(`\n${err instanceof NotLoggedInError ? err.message : err.stack}`);
  process.exit(1);
}
