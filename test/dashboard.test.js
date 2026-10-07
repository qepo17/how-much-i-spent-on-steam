import assert from 'node:assert/strict';
import { parseProfileXml, parseProfileLevel } from '../src/parse.js';
import { steamIdFromCookie } from '../src/steam.js';
import { createAppMatcher, enrichGames, toAppInfo } from '../src/enrich.js';
import { normalizeName } from '../src/merge.js';
import { gamesCsv, historyCsv, toCsv } from '../public/js/csv.js';
import { money, maskAmounts, totalAsShown, setAmountsHidden } from '../public/js/format.js';
import { summarize, paymentMethod, purchaseCategory, costPerHour, isBarelyPlayed } from '../public/js/stats.js';

// SteamID from the login cookie
assert.equal(steamIdFromCookie('76561198000000001%7C%7CeyJhbGciOi'), '76561198000000001');
assert.equal(steamIdFromCookie('76561198000000001||eyJhbGciOi'), '76561198000000001');
assert.equal(steamIdFromCookie('garbage'), null);

// Profile
const profile = parseProfileXml(`<?xml version="1.0" encoding="UTF-8"?><profile>
  <steamID64>76561198000000001</steamID64>
  <steamID><![CDATA[Gaben Fan]]></steamID>
  <onlineState>online</onlineState>
  <avatarFull><![CDATA[https://avatars.example/full.jpg]]></avatarFull>
  <customURL><![CDATA[gabenfan]]></customURL>
  <memberSince>March 20, 2015</memberSince>
  <location><![CDATA[]]></location>
  <groups><group><headline><![CDATA[not the profile headline]]></headline></group></groups>
</profile>`);
assert.equal(profile.name, 'Gaben Fan');
assert.equal(profile.memberSince, '2015-03-20');
assert.equal(profile.profileUrl, 'https://steamcommunity.com/id/gabenfan/');
assert.equal(profile.location, null);
assert.equal(profile.headline, null, 'group headlines are not the profile headline');
assert.equal(parseProfileXml('<response><error>The specified profile could not be found.</error></response>'), null);
assert.equal(parseProfileLevel('<span class="friendPlayerLevelNum">24</span>'), 24);
assert.equal(parseProfileLevel('<div>private</div>'), null);

// Store items -> app info
const item = (appid, name, type = 0, extra = {}) => ({
  appid, name, type,
  assets: { asset_url_format: `steam/apps/${appid}/\${FILENAME}?t=1`, library_capsule: 'library_600x900.jpg', header: 'header.jpg' },
  tags: [{ tagid: 19, weight: 10 }, { tagid: 999, weight: 5 }],
  release: { steam_release_date: 1700000000 },
  basic_info: { developers: [{ name: 'Studio' }] },
  ...extra,
});
const info = toAppInfo(item(10, 'Counter-Strike'), new Map([[19, 'Action']]));
assert.equal(info.art.capsule, 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg?t=1');
assert.equal(info.art.hero, null);
assert.deepEqual(info.tags, ['Action'], 'unknown tag IDs are dropped');
assert.equal(info.released, '2023-11-14');
assert.equal(info.type, 'game');

// License name -> app
const apps = [
  toAppInfo(item(1, 'EA SPORTS FC™ 26')),
  toAppInfo(item(2, 'WARDOGS')),
  toAppInfo(item(3, 'WARDOGS Playtest', 12)),
  toAppInfo(item(4, 'Hades')),
  toAppInfo(item(5, 'Hades Soundtrack', 11)),
  toAppInfo(item(6, 'NieR:Automata™')),
];
const match = createAppMatcher(apps);
assert.deepEqual(match('EA SPORTS FC™ 26 Ultimate Edition'), { app: apps[0], exact: false });
assert.equal(match('WARDOGS Playtest for store signup').app.appid, 3, 'longest prefix wins');
assert.equal(match('WARDOGS').exact, true);
assert.equal(match('NieR:Automata&trade; Game of the YoRHa Edition').app.appid, 6, 'double-escaped ™');
assert.equal(match('Totally Unknown Game'), null);
assert.equal(match('4 YoRHa'), null, 'no match on a tiny prefix');
assert.equal(normalizeName('NieR:Automata&trade;'), 'nier automata');

const enriched = enrichGames([{ name: 'Hades' }, { name: 'Mystery' }], apps, new Map([[4, { playtime_forever: 600, rtime_last_played: 1700000000 }]]));
assert.equal(enriched[0].app.appid, 4);
assert.equal(enriched[0].app.matchedBy, 'name');
assert.equal(enriched[0].playtimeMinutes, 600);
assert.equal(enriched[0].lastPlayed, '2023-11-14');
assert.equal(enriched[1].app, null);
assert.equal(enriched[1].playtimeMinutes, null);

// CSV
assert.equal(toCsv([{ header: 'a', value: (r) => r }], ['x,y', 'say "hi"', '=HYPERLINK("x")', 5, null]),
  'a\r\n"x,y"\r\n"say ""hi"""\r\n"\'=HYPERLINK(""x"")"\r\n5\r\n\r\n');

const sampleGames = [
  {
    name: 'Hades', acquired: '2024-01-13', source: 'Steam Store', price: 108999, currency: 'Rp', matchedBy: 'name',
    purchase: { id: '111', date: '2024-01-13', type: 'Purchase', items: ['Hades™'], total: { raw: 'Rp 108 999', amount: 108999, currency: 'Rp' }, payment: 'GoPay', shared: false },
    app: { ...apps[3], tags: ['Action', 'Roguelike'] }, playtimeMinutes: 600, lastPlayed: '2024-02-01',
  },
  {
    name: 'Portal 2', acquired: '2023-12-24', source: 'Steam Store', price: null, currency: 'Rp', matchedBy: 'name',
    purchase: { id: '555', date: '2023-12-24', type: 'Purchase', items: ['Portal 2', 'Portal'], total: { raw: 'Rp 99 999', amount: 99999, currency: 'Rp' }, payment: 'Visa', shared: true },
    app: null, playtimeMinutes: null, lastPlayed: null,
  },
  { name: 'Dota 2', acquired: '2015-03-20', source: 'Complimentary', price: null, currency: null, purchase: null, app: null },
];
const csvLines = gamesCsv(sampleGames).trim().split('\r\n');
assert.equal(csvLines.length, 4);
assert.match(csvLines[0], /^Game,App ID,Type,Acquired,Source,Price paid,Currency,Price note,/);
assert.match(csvLines[1], /^Hades,4,game,2024-01-13,Steam Store,108999,Rp,exact,Hades™,108999,Rp,2024-01-13,GoPay,111,Studio,2023-11-14,Action; Roguelike,10,2024-02-01,https:\/\/store\.steampowered\.com\/app\/4\/$/);
assert.match(csvLines[2], /^Portal 2,,,2023-12-24,Steam Store,,,bundle,Portal 2 \+ Portal,99999,Rp,/);
assert.match(csvLines[3], /^Dota 2,,,2015-03-20,Complimentary,,,none,/);

// Stats
const history = [
  { id: '1', date: '2024-01-13', items: ['Hades'], type: 'Purchase', payment: 'GoPay', total: { amount: 100, currency: 'Rp' }, refunded: false },
  { id: '2', date: '2024-06-01', items: ['A', 'B'], type: 'Gift Purchase', payment: 'Rp 50 Wallet Rp 150 Visa', total: { amount: 200, currency: 'Rp' }, refunded: false },
  { id: '3', date: '2025-01-05', items: ['C'], type: 'Purchase', payment: 'GoPay', total: { amount: 300, currency: 'Rp' }, refunded: false },
  { id: '4', date: '2025-01-06', items: ['D'], type: 'Refund', payment: 'Wallet', total: { amount: 40, currency: 'Rp' }, refunded: true },
  { id: '5', date: '2025-02-01', items: ['Gems'], type: 'In-Game Purchase', payment: 'Wallet', total: { amount: 9, currency: 'Rp' }, refunded: false },
  { id: '6', date: '2025-03-01', items: ['E'], type: 'Purchase', payment: 'PayPal', total: { amount: 5, currency: '$' }, refunded: false },
];
const s = summarize({ games: sampleGames, history }, new Date('2025-06-30T12:00:00Z'));
assert.equal(s.currency, 'Rp');
assert.equal(s.total, 600);
assert.equal(s.otherCurrencyCount, 1);
assert.deepEqual([...s.byYear], [['2024', { amount: 300, count: 2 }], ['2025', { amount: 300, count: 1 }]]);
assert.equal(s.byMonth.get('2024-06').amount, 200);
assert.equal(s.biggest[0].id, '3');
assert.deepEqual(s.refunds, { count: 1, amount: 40 });
assert.deepEqual(s.ytd, { year: 2025, amount: 300, previous: 300 });
assert.deepEqual(s.payments.map((p) => p.name), ['GoPay', 'Wallet + Visa']);
assert.equal(s.avgPrice, 108999);
assert.deepEqual(s.tags.map((t) => t.name), ['Action', 'Roguelike']);

assert.equal(purchaseCategory({ type: '12 Market Transactions' }), 'market');
assert.equal(purchaseCategory({ type: 'Gift Purchase' }), 'gift');
assert.equal(purchaseCategory({ type: 'Purchase', refunded: true }), 'refund');
assert.equal(paymentMethod('Rp 25 354 Wallet Rp 473 646 Dana'), 'Wallet + Dana');
assert.equal(paymentMethod('$5.00 Wallet $4.99 Visa **1234'), 'Wallet + Visa **1234');
assert.equal(paymentMethod('Visa **08'), 'Visa **08');
assert.equal(costPerHour(sampleGames[0]), 10899.9);
assert.equal(costPerHour({ price: 100, playtimeMinutes: 30 }), null, 'under an hour is too noisy');

// Bought, barely played
const shelfGames = [
  { name: 'Unplayed', acquired: '2024-01-01', price: 500, currency: 'Rp', purchase: { id: 'a' }, playtimeMinutes: 0 },
  { name: 'Tried once', acquired: '2024-02-01', price: 900, currency: 'Rp', purchase: { id: 'b' }, playtimeMinutes: 179 },
  { name: 'From a bundle', acquired: '2024-03-01', price: null, currency: 'Rp', purchase: { id: 'c' }, playtimeMinutes: 30 },
  { name: 'Other currency', acquired: '2024-04-01', price: 5, currency: '$', purchase: { id: 'd' }, playtimeMinutes: 10 },
  { name: 'Three hours', acquired: '2024-05-01', price: 100, currency: 'Rp', purchase: { id: 'e' }, playtimeMinutes: 180 },
  { name: 'Free', acquired: '2024-06-01', price: null, currency: null, purchase: null, playtimeMinutes: 0 },
  { name: 'DLC', acquired: '2024-07-01', price: 200, currency: 'Rp', purchase: { id: 'f' }, playtimeMinutes: null },
];
const shelf = summarize({ games: shelfGames, history }).barelyPlayed;
assert.deepEqual(shelf.games.map((g) => g.name), ['Tried once', 'Unplayed', 'Other currency', 'From a bundle'], 'priciest first, bundles last');
assert.equal(shelf.spent, 1400, 'only exact prices in the main currency');
assert.equal(isBarelyPlayed({ purchase: {}, playtimeMinutes: 180 }), false, '3 h is enough');
assert.equal(isBarelyPlayed({ purchase: null, playtimeMinutes: 0 }), false, 'free games are not on the list');
assert.equal(isBarelyPlayed({ purchase: {}, playtimeMinutes: null }), false, 'no playtime on record is not the same as unplayed');

assert.match(historyCsv(history.slice(0, 1)), /^Date,Items,Type,Payment,Total,Currency,Total as shown,Refunded,Transaction ID\r\n2024-01-13,Hades,Purchase,GoPay,100,Rp,,no,1\r\n$/);

// Hide amounts
setAmountsHidden(true);
assert.equal(money(899000, 'Rp'), 'Rp •••••');
assert.equal(money(899000, '$', { compact: true }), '$•••');
assert.equal(money(null, 'Rp'), '');
assert.equal(totalAsShown({ raw: 'Rp 899 000', amount: 899000, currency: 'Rp' }), 'Rp •••••');
assert.equal(maskAmounts('Purchased Rp 81 841 Wallet Credit'), 'Purchased Rp ••••• Wallet Credit');
assert.equal(maskAmounts('Rp 25 354 Wallet Rp 473 646 Dana'), 'Rp ••••• Wallet Rp ••••• Dana');
assert.equal(maskAmounts('4,99€ Wallet'), '•••••€ Wallet');
assert.equal(maskAmounts('Battlefield™ 6'), 'Battlefield™ 6', 'numbers in game names stay');
assert.equal(maskAmounts('Visa **08'), 'Visa **08');
setAmountsHidden(false);
assert.equal(money(899000, 'Rp'), `Rp ${(899000).toLocaleString()}`);
assert.equal(maskAmounts('Purchased Rp 81 841 Wallet Credit'), 'Purchased Rp 81 841 Wallet Credit');

console.log('All dashboard tests passed');
