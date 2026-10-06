const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const compactFmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

// "Hide amounts": every amount on screen becomes a fixed-width mask, so its length doesn't hint at the value.
let amountsHidden = false;
export const setAmountsHidden = (hidden) => (amountsHidden = hidden);
const MASK = '•••••';

const withCurrency = (n, currency) => (!currency ? n : currency.length === 1 ? `${currency}${n}` : `${currency} ${n}`);

/** Steam's own symbols ("Rp", "$", "€") rather than ISO codes, since that's what history rows contain. */
export function money(amount, currency, { compact = false } = {}) {
  if (amount == null) return '';
  if (amountsHidden) return withCurrency(compact ? '•••' : MASK, currency);
  const n =
    compact && Math.abs(amount) >= 10_000
      ? compactFmt.format(amount)
      : amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return withCurrency(n, currency);
}

// Amounts Steam bakes into text: "Purchased Rp 81 841 Wallet Credit", "Rp 25 354 Wallet Rp 473 646 Dana", "4,99€ Wallet".
const EMBEDDED_AMOUNT = /(?:Rp|USD|R\$|[$€£¥₹₩₽])\s?\d[\d.,]*(?:\s\d{3})*|\d[\d.,]*(?:\s\d{3})*\s?(?:€|zł|kr|₫)/g;

/** Free text from Steam with any amounts in it masked while amounts are hidden. */
export function maskAmounts(text) {
  if (!text || !amountsHidden) return text ?? '';
  return text.replace(EMBEDDED_AMOUNT, (m) => m.replace(/\d[\d.,\s]*\d|\d/, MASK));
}

/** A purchase total exactly as Steam printed it ("Rp 899 000"), unless amounts are hidden. */
export function totalAsShown(total) {
  if (!total) return '';
  return amountsHidden ? withCurrency(MASK, total.currency) : total.raw ?? '';
}

export function formatDate(iso, fallback = '', opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return fallback ?? '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts);
}

export const monthName = (m, style = 'short') => new Date(2000, m, 1).toLocaleDateString(undefined, { month: style });

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function timeAgo(date) {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function yearsSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 31_557_600_000);
}

export function hours(minutes) {
  if (minutes == null) return '';
  const h = minutes / 60;
  return h < 10 ? `${h.toFixed(1)} h` : `${Math.round(h).toLocaleString()} h`;
}

export function plural(n, one, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Stable hue per name, for placeholder covers. */
export function hueFor(name) {
  let h = 0;
  for (const ch of name ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function initials(name) {
  const words = String(name ?? '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}
