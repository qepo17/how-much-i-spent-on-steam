// Names on the licenses page and in purchase history don't always match exactly,
// e.g. "Hades" vs "Hades™" or "Foo - Commercial License" vs "Foo".
const SUFFIXES = [
  /\s*-\s*commercial license$/,
  /\s*\(retail\)$/,
  /\s*-\s*retail$/,
  /\s*-\s*steam store( and retail)? key$/,
  /\s+standard edition$/,
];

export function normalizeName(name) {
  let s = (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&(trade|reg|copy);/g, '') // the licenses page sometimes double-escapes these
    .trim();
  for (const re of SUFFIXES) s = s.replace(re, '');
  return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** "Purchase" and "Gift Purchase" count; in-game purchases, Market and wallet top-ups don't. */
export function isGamePurchase(p) {
  return /^(gift )?purchase\b/i.test(p.type) && !/in-game/i.test(p.type) && !p.refunded && p.items.length > 0;
}

const dayDiff = (a, b) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000 : Infinity);

function closestByDate(candidates, date) {
  return [...candidates].sort((x, y) => dayDiff(x.date, date) - dayDiff(y.date, date))[0];
}

function pushTo(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function merge(licenses, history) {
  const purchases = history.map((p, i) => ({ ...p, key: p.id ?? `row-${i}` }));
  const usable = purchases.filter(isGamePurchase);

  const byName = new Map();
  for (const p of usable) for (const item of p.items) pushTo(byName, normalizeName(item), p);

  const byDate = new Map();
  for (const p of usable) if (/^purchase\b/i.test(p.type)) pushTo(byDate, p.date, p);

  const licensesPerDate = new Map();
  for (const l of licenses) pushTo(licensesPerDate, l.date, l);

  const linked = new Set();

  const games = licenses.map((license) => {
    let purchase = null;
    let matchedBy = null;

    const nameMatches = byName.get(normalizeName(license.name));
    if (nameMatches?.length) {
      purchase = closestByDate(nameMatches, license.date);
      matchedBy = 'name';
    } else {
      // Bundles show up as one line in history but several licenses, so fall back to "bought that day".
      const sameDay = byDate.get(license.date);
      if (sameDay?.length === 1 && /store/i.test(license.source ?? '')) {
        purchase = sameDay[0];
        matchedBy = 'date';
      }
    }

    if (purchase) linked.add(purchase.key);

    // Only claim a price when the purchase clearly maps to this one game.
    const sharedPurchase =
      purchase &&
      (purchase.items.length > 1 || (matchedBy === 'date' && (licensesPerDate.get(license.date)?.length ?? 0) > 1));

    return {
      name: license.name,
      acquired: license.date,
      acquiredRaw: license.dateRaw,
      source: license.source,
      price: purchase && !sharedPurchase ? purchase.total?.amount ?? null : null,
      currency: purchase?.total?.currency ?? null,
      matchedBy,
      purchase: purchase
        ? {
            id: purchase.id,
            date: purchase.date,
            type: purchase.type,
            items: purchase.items,
            total: purchase.total,
            payment: purchase.payment,
            shared: Boolean(sharedPurchase),
          }
        : null,
    };
  });

  const unlinkedPurchases = purchases
    .filter((p) => !linked.has(p.key) && p.items.length && !/wallet|market/i.test(p.type))
    .map(({ key, ...p }) => p);

  return { games, unlinkedPurchases };
}
