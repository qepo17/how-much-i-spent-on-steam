import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { extractHistoryCursor, extractLicensesNextPage } from './parse.js';

const STORE = 'https://store.steampowered.com';
const COMMUNITY = 'https://steamcommunity.com';
const API = 'https://api.steampowered.com';
const USER_AGENT = 'Mozilla/5.0 (how-much-i-spent-on-steam personal script)';
const PAGE_DELAY_MS = 1200;
const MAX_PAGES = 300;
const STORE_ITEMS_BATCH = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class NotLoggedInError extends Error {
  constructor() {
    super(
      'Steam redirected to the login page, so the steamLoginSecure cookie is missing or expired. ' +
        'Copy a fresh value from your browser into .env and run again.'
    );
  }
}

/** steamLoginSecure is "<steamid64>||<token>", URL-encoded, so the account's SteamID comes for free. */
export function steamIdFromCookie(loginSecure) {
  const id = decodeURIComponent(loginSecure ?? '').split('||')[0];
  return /^\d{17}$/.test(id) ? id : null;
}

export function createSteamClient({ loginSecure, debugDir = null, log = () => {} }) {
  // Steam only checks that the sessionid form field matches the sessionid cookie, so any random value works.
  const sessionid = randomBytes(12).toString('hex');
  const headers = {
    Cookie: [
      `steamLoginSecure=${loginSecure}`,
      `sessionid=${sessionid}`,
      'Steam_Language=english',
      'birthtime=0',
      'wants_mature_content=1',
    ].join('; '),
    'User-Agent': USER_AGENT,
    'Accept-Language': 'en',
  };

  async function dump(name, body) {
    if (!debugDir) return;
    await mkdir(debugDir, { recursive: true });
    await writeFile(`${debugDir}/${name}`, body);
  }

  async function request(url, init = {}, attempt = 1) {
    const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers }, redirect: 'follow' });
    if (res.status === 429 && attempt < 4) {
      const wait = 5000 * attempt;
      log(`Rate limited, waiting ${wait / 1000}s…`);
      await sleep(wait);
      return request(url, init, attempt + 1);
    }
    if (/\/login/.test(res.url)) throw new NotLoggedInError();
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} failed with HTTP ${res.status}`);
    return res;
  }

  async function getPage(path, dumpName) {
    const res = await request(`${STORE}${path}`);
    const html = await res.text();
    await dump(dumpName, html);
    return html;
  }

  /** Returns the HTML of every licenses page, following the "Next" link. */
  async function fetchLicensesHtml() {
    const pages = [await getPage('/account/licenses/?l=english', 'licenses-0.html')];
    let next = extractLicensesNextPage(pages[0]);

    for (let page = 1; next && page < MAX_PAGES; page++) {
      await sleep(PAGE_DELAY_MS);
      log(`Loading licenses page ${page + 1}…`);
      const query = new URLSearchParams(next);
      query.set('l', 'english');
      pages.push(await getPage(`/account/licenses/?${query}`, `licenses-${page}.html`));
      next = extractLicensesNextPage(pages[page]);
    }

    return pages;
  }

  /** Returns the first page's HTML followed by each AJAX chunk's row HTML. */
  async function fetchHistoryHtml() {
    const first = await getPage('/account/history/?l=english', 'history-0.html');
    const chunks = [first];
    let cursor = extractHistoryCursor(first);

    for (let page = 1; cursor && page < MAX_PAGES; page++) {
      await sleep(PAGE_DELAY_MS);
      log(`Loading purchase history page ${page + 1}…`);

      const body = new URLSearchParams({ sessionid, l: 'english' });
      for (const [key, value] of Object.entries(cursor)) body.append(`cursor[${key}]`, String(value));

      const res = await request(`${STORE}/account/AjaxLoadMoreHistory/?l=english`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Origin: STORE,
          Referer: `${STORE}/account/history/`,
        },
        body,
      });

      const json = await res.json();
      await dump(`history-${page}.json`, JSON.stringify(json, null, 2));
      if (!json?.html) break;

      chunks.push(json.html);
      cursor = json.cursor ?? null;
    }

    return chunks;
  }

  /** Public endpoints get no cookie. Errors name only the path, so an API key in the query never reaches the log. */
  async function publicGet(url) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error(`GET ${new URL(url).pathname} failed with HTTP ${res.status}`);
    return res;
  }

  async function fetchProfileXml(steamId) {
    return (await publicGet(`${COMMUNITY}/profiles/${steamId}/?xml=1`)).text();
  }

  async function fetchProfileHtml(steamId) {
    return (await publicGet(`${COMMUNITY}/profiles/${steamId}/`)).text();
  }

  /** Every app on the account (games, DLC, soundtracks, tools) as bare app IDs, plus the wishlist size. */
  async function fetchUserData() {
    const json = await (await request(`${STORE}/dynamicstore/userdata/`)).json();
    return { ownedAppIds: json.rgOwnedApps ?? [], wishlistCount: json.rgWishlist?.length ?? 0 };
  }

  /** Name, type, art, developers, release date and tag IDs for each app. No API key needed. */
  async function fetchStoreItems(appids) {
    const items = [];
    for (let i = 0; i < appids.length; i += STORE_ITEMS_BATCH) {
      if (i) await sleep(300);
      const input = {
        ids: appids.slice(i, i + STORE_ITEMS_BATCH).map((appid) => ({ appid })),
        context: { language: 'english', country_code: 'US' },
        data_request: { include_assets: true, include_release: true, include_basic_info: true, include_tag_count: 6 },
      };
      const url = `${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`;
      const json = await (await publicGet(url)).json();
      items.push(...(json.response?.store_items ?? []).filter((item) => item.success === 1 && item.name));
    }
    return items;
  }

  /** tagid -> "Open World" */
  async function fetchTagNames() {
    const tags = await (await publicGet(`${STORE}/tagdata/populartags/english`)).json();
    return new Map(tags.map((t) => [t.tagid, t.name]));
  }

  /** Playtime needs a Web API key (https://steamcommunity.com/dev/apikey); everything else works without one. */
  async function fetchOwnedGames(apiKey, steamId) {
    const params = new URLSearchParams({ key: apiKey, steamid: steamId, include_played_free_games: '1', format: 'json' });
    const json = await (await publicGet(`${API}/IPlayerService/GetOwnedGames/v1/?${params}`)).json();
    return json.response?.games ?? [];
  }

  return {
    fetchLicensesHtml,
    fetchHistoryHtml,
    fetchProfileXml,
    fetchProfileHtml,
    fetchUserData,
    fetchStoreItems,
    fetchTagNames,
    fetchOwnedGames,
  };
}
