import * as cheerio from 'cheerio';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

function iso(year, monthIndex, day) {
  if (monthIndex === undefined || !year || !day) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Steam shows "13 Jan, 2024" or "Jan 13, 2024" depending on account region. Returns YYYY-MM-DD or null. */
export function parseSteamDate(text) {
  const s = clean(text);
  let m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.?,? (\d{4})$/);
  if (m) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/);
  if (m) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  return null;
}

/** "Rp 108 999" -> { amount: 108999, currency: "Rp" }, "$9.99" -> { 9.99, "$" }, "9,99€" -> { 9.99, "€" } */
export function parseMoney(text) {
  const raw = clean(text);
  if (!raw) return null;
  const numMatch = raw.match(/\d[\d\s.,']*/);
  if (!numMatch) return { raw, amount: null, currency: null };

  const digits = numMatch[0].replace(/[\s']/g, '');
  const lastSep = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
  // A separator followed by 1-2 trailing digits is a decimal point; otherwise it's a thousands separator.
  const amount =
    lastSep !== -1 && digits.length - lastSep - 1 <= 2
      ? parseFloat(`${digits.slice(0, lastSep).replace(/[.,]/g, '')}.${digits.slice(lastSep + 1) || '0'}`)
      : parseFloat(digits.replace(/[.,]/g, ''));

  const currency = clean(raw.replace(numMatch[0], ' ').replace(/[+-]/g, '')) || null;
  return { raw, amount: Number.isFinite(amount) ? amount : null, currency };
}

// Parsing a bare <tr> fragment drops the rows, so AJAX chunks get wrapped in a table first.
function loadRows(html) {
  const isFragment = !/<table|<html/i.test(html);
  return cheerio.load(isFragment ? `<table><tbody>${html}</tbody></table>` : html);
}

const isPaymentDiv = ($el) => /payment/i.test($el.attr('class') ?? '');

/** Rows from the purchase history page or an AjaxLoadMoreHistory chunk. */
export function parseHistoryRows(html) {
  const $ = loadRows(html);
  const rows = [];

  $('tr.wallet_table_row').each((_, tr) => {
    const $tr = $(tr);

    const $items = $tr.find('td.wht_items');
    let items = $items
      .children('div')
      .filter((_, d) => !isPaymentDiv($(d)))
      .map((_, d) => clean($(d).text()))
      .get()
      .filter(Boolean);
    if (!items.length) {
      items = $items.text().split('\n').map(clean).filter(Boolean);
    }

    const $type = $tr.find('td.wht_type');
    const typeDiv = $type.children('div').filter((_, d) => !isPaymentDiv($(d))).first();
    const type = clean(typeDiv.length ? typeDiv.text() : $type.text().split('\n').map(clean).find(Boolean));
    const payment = clean($type.find('[class*="payment"]').first().text()) || null;

    const totalText = $tr.find('td.wht_total').text();
    const onclick = $tr.attr('onclick') ?? '';

    rows.push({
      id: onclick.match(/transid=(\d+)/)?.[1] ?? null,
      date: parseSteamDate($tr.find('td.wht_date').text()),
      dateRaw: clean($tr.find('td.wht_date').text()),
      items,
      type,
      payment,
      total: parseMoney(totalText),
      refunded: /refund/i.test(type) || /refunded/i.test(totalText) || $tr.find('.wht_refunded').length > 0,
    });
  });

  return rows;
}

/** Rows from https://store.steampowered.com/account/licenses/ */
export function parseLicenses(html) {
  const $ = cheerio.load(html);
  const licenses = [];

  $('table.account_table tr').each((_, tr) => {
    const $tds = $(tr).children('td');
    if ($tds.length < 2) return; // header row

    const $date = $tds.filter('.license_date_col').first();
    const $source = $tds.filter('.license_acquisition_col').first();
    const $name = $tds.not('.license_date_col, .license_acquisition_col').first().clone();

    const removeLink = $name.find('.free_license_remove_link');
    const packageId = removeLink.find('a').attr('href')?.match(/RemoveFreeLicense\(\s*(\d+)/)?.[1] ?? null;
    removeLink.remove();

    const name = clean($name.text());
    if (!name) return;

    licenses.push({
      name,
      date: parseSteamDate($date.text()),
      dateRaw: clean($date.text()),
      source: clean($source.text()) || null,
      packageId,
    });
  });

  return licenses;
}

/** The first page embeds the pagination cursor in an inline script. */
export function extractHistoryCursor(html) {
  const m = html.match(/g_historyCursor\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** https://steamcommunity.com/profiles/<id>/?xml=1. Private profiles return only the name and avatar. */
export function parseProfileXml(xml) {
  const $ = cheerio.load(xml, { xml: true });
  if (!$('profile').length) return null;
  const field = (name) => clean($(`profile > ${name}`).first().text()) || null;
  const steamId = field('steamID64');
  const customUrl = field('customURL');
  return {
    steamId,
    name: field('steamID'),
    avatar: field('avatarFull') ?? field('avatarMedium'),
    onlineState: field('onlineState'),
    stateMessage: field('stateMessage'),
    memberSince: parseSteamDate(field('memberSince')),
    memberSinceRaw: field('memberSince'),
    location: field('location'),
    headline: field('headline'),
    privacy: field('privacyState'),
    profileUrl: customUrl ? `https://steamcommunity.com/id/${customUrl}/` : `https://steamcommunity.com/profiles/${steamId}/`,
  };
}

/** The Steam level badge on a profile page. */
export function parseProfileLevel(html) {
  const level = html.match(/class="friendPlayerLevelNum">\s*(\d+)/)?.[1];
  return level ? Number(level) : null;
}
