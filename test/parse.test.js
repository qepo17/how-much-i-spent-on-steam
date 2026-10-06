import assert from 'node:assert/strict';
import { parseSteamDate, parseMoney, parseHistoryRows, parseLicenses, extractHistoryCursor, extractLicensesNextPage } from '../src/parse.js';
import { merge, normalizeName } from '../src/merge.js';

const row = (date, items, type, payment, total, transid) => `
<tr class="wallet_table_row wallet_table_row_amt_change" onclick="location.href='https://help.steampowered.com/en/wizard/HelpWithPurchase?transid=${transid}'">
  <td class="wht_date">${date}</td>
  <td class="wht_items">${items.map((i) => `<div>${i}</div>`).join('')}</td>
  <td class="wht_type "><div>${type}</div><div class="wth_payment">${payment}</div></td>
  <td class="wht_total ">${total}</td>
  <td class="wht_wallet_change wallet_column"></td>
  <td class="wht_wallet_balance wallet_column"></td>
</tr>`;

const historyPage = `<html><body>
<table class="wallet_history_table"><tbody>
<tr><th class="wht_date">Date</th></tr>
${row('13 Jan, 2024', ['Hades™'], 'Purchase', 'GoPay', 'Rp 108 999', '111')}
${row('2 Feb, 2024', ['Cozy Bundle'], 'Purchase', 'Visa', 'Rp 250.000', '222')}
${row('5 Mar, 2024', ['Celeste'], 'Refund', 'Steam Wallet', 'Rp 75 999', '333')}
${row('6 Mar, 2024', ['Steam Community Market'], 'Market Transaction', '', 'Rp 1 500', '444')}
</tbody></table>
<script>var g_historyCursor = {"wallet_txnid":"999","timestamp_newest":1700000000,"balance":"0","currency":10};</script>
</body></html>`;

const ajaxChunk = row('Dec 24, 2023', ['Portal 2', 'Portal'], 'Purchase', 'Visa', '$9.99', '555');

const licensesPage = `<table class="account_table">
<tr><th>Date</th><th>Item</th><th>Acquisition Method</th></tr>
<tr><td class="license_date_col">13 Jan, 2024</td><td>Hades</td><td class="license_acquisition_col">Steam Store</td></tr>
<tr><td class="license_date_col">2 Feb, 2024</td><td>Stardew Valley</td><td class="license_acquisition_col">Steam Store</td></tr>
<tr><td class="license_date_col">2 Feb, 2024</td><td>Spiritfarer</td><td class="license_acquisition_col">Steam Store</td></tr>
<tr><td class="license_date_col">24 Dec, 2023</td><td>Portal 2</td><td class="license_acquisition_col">Steam Store</td></tr>
<tr><td class="license_date_col">1 Jun, 2022</td><td><div class="free_license_remove_link"><a href="javascript:RemoveFreeLicense( 12345, 'x' );">Remove</a></div>Dota 2</td><td class="license_acquisition_col">Complimentary</td></tr>
</table>`;

// Dates and money
assert.equal(parseSteamDate('13 Jan, 2024'), '2024-01-13');
assert.equal(parseSteamDate('Jan 13, 2024'), '2024-01-13');
assert.equal(parseSteamDate('  5 Sept, 2023 '), '2023-09-05');
assert.deepEqual(parseMoney('Rp 108 999'), { raw: 'Rp 108 999', amount: 108999, currency: 'Rp' });
assert.equal(parseMoney('Rp 1.250.000').amount, 1250000);
assert.equal(parseMoney('$9.99').amount, 9.99);
assert.deepEqual([parseMoney('9,99€').amount, parseMoney('9,99€').currency], [9.99, '€']);
assert.equal(parseMoney('A$ 1,299.95').amount, 1299.95);
assert.equal(normalizeName('Hades™'), normalizeName('Hades'));

// History parsing
const history = [...parseHistoryRows(historyPage), ...parseHistoryRows(ajaxChunk)];
assert.equal(history.length, 5);
assert.deepEqual(history[0].items, ['Hades™']);
assert.equal(history[0].type, 'Purchase');
assert.equal(history[0].payment, 'GoPay');
assert.equal(history[0].id, '111');
assert.equal(history[2].refunded, true);
assert.deepEqual(history[4].items, ['Portal 2', 'Portal']);
assert.equal(history[4].date, '2023-12-24');
assert.deepEqual(extractHistoryCursor(historyPage), { wallet_txnid: '999', timestamp_newest: 1700000000, balance: '0', currency: 10 });

// Licenses parsing
const licenses = parseLicenses(licensesPage);
assert.equal(licenses.length, 5);
assert.equal(licenses[4].name, 'Dota 2');
assert.equal(licenses[4].packageId, '12345');
assert.equal(licenses[4].source, 'Complimentary');
assert.equal(extractLicensesNextPage(licensesPage), null);
assert.equal(
  extractLicensesNextPage('<div class="license_paginator_ctn"><a class="license_paginator_next" href="?continuationToken=1668512976:577&amp;offset=100">Next</a></div>'),
  '?continuationToken=1668512976:577&offset=100'
);

// Merge
const { games, unlinkedPurchases } = merge(licenses, history);
const g = Object.fromEntries(games.map((x) => [x.name, x]));
assert.equal(g['Hades'].price, 108999);
assert.equal(g['Hades'].matchedBy, 'name');
assert.equal(g['Stardew Valley'].matchedBy, 'date');
assert.equal(g['Stardew Valley'].price, null, 'bundle split across two licenses gets no single price');
assert.equal(g['Stardew Valley'].purchase.shared, true);
assert.equal(g['Portal 2'].price, null, 'multi-item purchase gets no single price');
assert.equal(g['Dota 2'].purchase, null);
assert.deepEqual(unlinkedPurchases.map((p) => p.items[0]), ['Celeste']);

console.log('All parse/merge tests passed');
