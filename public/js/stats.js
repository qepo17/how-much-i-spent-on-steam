// Everything the dashboard derives from library.json. Pure, so `npm test` can cover it.

/** Same rule as src/merge.js: store and gift purchases count; in-game, Market and wallet don't. */
export const isGamePurchase = (p) =>
  /^(gift )?purchase\b/i.test(p.type) && !/in-game/i.test(p.type) && !p.refunded && p.items.length > 0;

export const HISTORY_CATEGORIES = [
  { id: 'game', label: 'Games' },
  { id: 'gift', label: 'Gifts' },
  { id: 'ingame', label: 'In-game' },
  { id: 'market', label: 'Market' },
  { id: 'refund', label: 'Refunds' },
  { id: 'other', label: 'Other' },
];

export function purchaseCategory(p) {
  if (p.refunded || /refund/i.test(p.type)) return 'refund';
  if (/market/i.test(p.type)) return 'market';
  if (/in-game/i.test(p.type)) return 'ingame';
  if (/^gift purchase/i.test(p.type)) return 'gift';
  if (/^purchase/i.test(p.type)) return 'game';
  return 'other';
}

/**
 * Split payments come through as "Rp 25 354 Wallet Rp 473 646 Dana": drop the amounts and keep the methods,
 * so the breakdown groups them as "Wallet + Dana".
 */
export function paymentMethod(raw) {
  if (!raw) return 'Unknown';
  const words = raw.split(/\s+/);
  const isAmount = (w) => /^[$€£¥₹₩₽]?\d[\d.,]*[€₫]?$/.test(w ?? '');
  const groups = [[]];
  words.forEach((w, i) => {
    const currencyPrefix = w.length <= 3 && isAmount(words[i + 1]); // "Rp", "USD", "R$"
    if (isAmount(w) || currencyPrefix) {
      if (groups.at(-1).length) groups.push([]);
    } else groups.at(-1).push(w);
  });
  const methods = groups.filter((g) => g.length).map((g) => g.join(' '));
  return methods.join(' + ') || raw;
}

export function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function countBy(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function add(map, key, amount) {
  const entry = map.get(key) ?? { amount: 0, count: 0 };
  entry.amount += amount;
  entry.count += 1;
  map.set(key, entry);
}

/** Spending to the same day of the year in `year`, so a half-finished year compares fairly. */
function spentUntilDayOfYear(purchases, year, today) {
  const cutoff = `${year}${today.toISOString().slice(4, 10)}`;
  return purchases.filter((p) => p.date.startsWith(String(year)) && p.date <= cutoff).reduce((s, p) => s + p.total.amount, 0);
}

export const BARELY_PLAYED_MINUTES = 180;

/** Paid for, but under 3 hours on Steam's clock. Games Steam reports no playtime for (DLC, unmatched names) don't count. */
export const isBarelyPlayed = (g) => g.purchase != null && g.playtimeMinutes != null && g.playtimeMinutes < BARELY_PLAYED_MINUTES;

export function summarize({ games = [], history = [] }, today = new Date()) {
  const dated = history.filter(isGamePurchase).filter((p) => p.date && p.total?.amount != null);
  const currency = mostCommon(dated.map((p) => p.total.currency));
  const purchases = dated.filter((p) => p.total.currency === currency);

  const byYear = new Map();
  const byMonth = new Map();
  const byPayment = new Map();
  for (const p of purchases) {
    add(byYear, p.date.slice(0, 4), p.total.amount);
    add(byMonth, p.date.slice(0, 7), p.total.amount);
    add(byPayment, paymentMethod(p.payment), p.total.amount);
  }

  const refunds = history.filter((p) => purchaseCategory(p) === 'refund');
  const priced = games.filter((g) => g.price != null && g.currency === currency);
  const year = today.getFullYear();
  const total = purchases.reduce((s, p) => s + p.total.amount, 0);
  // Most expensive first: that's the money sitting on the shelf. Bundle games have no price, so they go last.
  const barelyPlayed = games
    .filter(isBarelyPlayed)
    .sort((a, b) => (b.price ?? -1) - (a.price ?? -1) || (b.acquired ?? '').localeCompare(a.acquired ?? ''));

  return {
    currency,
    purchases,
    otherCurrencyCount: dated.length - purchases.length,
    total,
    first: purchases.reduce((m, p) => (!m || p.date < m ? p.date : m), null),
    last: purchases.reduce((m, p) => (!m || p.date > m ? p.date : m), null),
    byYear,
    byMonth,
    payments: [...byPayment].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount),
    biggest: [...purchases].sort((a, b) => b.total.amount - a.total.amount),
    refunds: {
      count: refunds.length,
      amount: refunds.filter((p) => p.total?.currency === currency).reduce((s, p) => s + (p.total.amount ?? 0), 0),
    },
    paidCount: games.filter((g) => g.purchase).length,
    freeCount: games.filter((g) => !g.purchase).length,
    avgPrice: priced.length ? priced.reduce((s, g) => s + g.price, 0) / priced.length : null,
    pricedCount: priced.length,
    ytd: { year, amount: spentUntilDayOfYear(purchases, year, today), previous: spentUntilDayOfYear(purchases, year - 1, today) },
    sources: countBy(games.map((g) => g.source ?? 'Unknown')),
    tags: countBy(games.flatMap((g) => g.app?.tags ?? [])),
    playMinutes: games.reduce((s, g) => s + (g.playtimeMinutes ?? 0), 0),
    barelyPlayed: {
      games: barelyPlayed,
      spent: barelyPlayed.filter((g) => g.price != null && g.currency === currency).reduce((s, g) => s + g.price, 0),
    },
  };
}

/** Price per hour played, only for games with an exact price and at least an hour on the clock. */
export function costPerHour(game) {
  if (game.price == null || !game.playtimeMinutes || game.playtimeMinutes < 60) return null;
  return game.price / (game.playtimeMinutes / 60);
}
