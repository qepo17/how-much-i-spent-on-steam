import { normalizeName } from './merge.js';

const ASSET_CDN = 'https://shared.fastly.steamstatic.com/store_item_assets/';

// IStoreBrowseService item types
const APP_TYPES = { 0: 'game', 1: 'demo', 4: 'dlc', 6: 'software', 11: 'soundtrack', 12: 'beta', 13: 'tool' };

const isoFromUnix = (seconds) => (seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null);

function assetUrl(assets, file) {
  if (!file || !assets?.asset_url_format) return null;
  return ASSET_CDN + assets.asset_url_format.replace('${FILENAME}', file);
}

/** The slice of a GetItems store item the dashboard uses. */
export function toAppInfo(item, tagNames = new Map()) {
  const a = item.assets;
  return {
    appid: item.appid,
    name: item.name,
    type: APP_TYPES[item.type] ?? 'other',
    developers: item.basic_info?.developers?.map((d) => d.name) ?? [],
    publishers: item.basic_info?.publishers?.map((p) => p.name) ?? [],
    released: isoFromUnix(item.release?.steam_release_date),
    tags: (item.tags ?? []).map((t) => tagNames.get(t.tagid)).filter(Boolean),
    art: {
      capsule: assetUrl(a, a?.library_capsule),
      header: assetUrl(a, a?.header),
      hero: assetUrl(a, a?.library_hero),
    },
  };
}

/**
 * License names are package names: "EA SPORTS FC 26 Ultimate Edition", "Icarus Free Weekend - Jul 2026",
 * "WARDOGS Playtest for store signup". When the full name isn't an app, the longest app name the license
 * name starts with wins ("ea sports fc 26", "icarus", "wardogs playtest").
 */
export function createAppMatcher(apps) {
  const byKey = new Map();
  for (const app of apps) {
    const key = normalizeName(app.name);
    const existing = byKey.get(key);
    // When names collide, prefer the game over its demo or soundtrack.
    if (key && (!existing || (existing.type !== 'game' && app.type === 'game'))) byKey.set(key, app);
  }

  return function match(name) {
    const words = normalizeName(name).split(' ').filter(Boolean);
    for (let n = words.length; n > 0; n--) {
      const key = words.slice(0, n).join(' ');
      if (key.length < 3) break;
      const app = byKey.get(key);
      if (app) return { app, exact: n === words.length };
    }
    return null;
  };
}

/** Attaches store info (and playtime, when known) to each merged game. */
export function enrichGames(games, apps, playtimes = new Map()) {
  const match = createAppMatcher(apps);
  return games.map((game) => {
    const found = match(game.name);
    const played = found ? playtimes.get(found.app.appid) : null;
    return {
      ...game,
      app: found ? { ...found.app, matchedBy: found.exact ? 'name' : 'prefix' } : null,
      playtimeMinutes: played?.playtime_forever ?? null,
      lastPlayed: isoFromUnix(played?.rtime_last_played),
    };
  });
}
