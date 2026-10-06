// Shared by the dashboard (download buttons) and `npm run export` (Node), so no DOM here.

/** Excel opens UTF-8 CSVs correctly only with a byte order mark (game names are full of ™ and accents). */
export const BOM = '﻿';

// A cell starting with one of these is run as a formula by spreadsheet apps.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, records) {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of records) lines.push(columns.map((c) => cell(c.value(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

export const priceKind = (g) => (g.price != null ? 'exact' : g.purchase ? 'bundle' : 'none');

const hours = (minutes) => (minutes == null ? null : Math.round((minutes / 60) * 10) / 10);

export const GAME_COLUMNS = [
  { header: 'Game', value: (g) => g.name },
  { header: 'App ID', value: (g) => g.app?.appid },
  { header: 'Type', value: (g) => g.app?.type },
  { header: 'Acquired', value: (g) => g.acquired ?? g.acquiredRaw },
  { header: 'Source', value: (g) => g.source },
  { header: 'Price paid', value: (g) => g.price },
  { header: 'Currency', value: (g) => g.price != null ? g.currency : null },
  { header: 'Price note', value: priceKind },
  { header: 'Purchase items', value: (g) => g.purchase?.items.join(' + ') },
  { header: 'Purchase total', value: (g) => g.purchase?.total?.amount },
  { header: 'Purchase currency', value: (g) => g.purchase?.total?.currency },
  { header: 'Purchase date', value: (g) => g.purchase?.date },
  { header: 'Payment', value: (g) => g.purchase?.payment },
  { header: 'Transaction ID', value: (g) => g.purchase?.id },
  { header: 'Developers', value: (g) => g.app?.developers.join('; ') },
  { header: 'Release date', value: (g) => g.app?.released },
  { header: 'Tags', value: (g) => g.app?.tags.join('; ') },
  { header: 'Hours played', value: (g) => hours(g.playtimeMinutes) },
  { header: 'Last played', value: (g) => g.lastPlayed },
  { header: 'Store page', value: (g) => (g.app ? `https://store.steampowered.com/app/${g.app.appid}/` : null) },
];

export const HISTORY_COLUMNS = [
  { header: 'Date', value: (p) => p.date ?? p.dateRaw },
  { header: 'Items', value: (p) => p.items.join(' + ') },
  { header: 'Type', value: (p) => p.type },
  { header: 'Payment', value: (p) => p.payment },
  { header: 'Total', value: (p) => p.total?.amount },
  { header: 'Currency', value: (p) => p.total?.currency },
  { header: 'Total as shown', value: (p) => p.total?.raw },
  { header: 'Refunded', value: (p) => (p.refunded ? 'yes' : 'no') },
  { header: 'Transaction ID', value: (p) => p.id },
];

export const gamesCsv = (games) => toCsv(GAME_COLUMNS, games);
export const historyCsv = (history) => toCsv(HISTORY_COLUMNS, history);
