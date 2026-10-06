import { esc, money, monthName, plural } from './format.js';

// Tooltip text rides on data attributes and is set with textContent, so nothing here is parsed as HTML.
const tip = (title, body) => `data-tip-title="${esc(title)}" data-tip-body="${esc(body)}"`;

/** Columns per year, with empty years filled in so gaps read as gaps. */
export function yearChart(byYear, currency, selectedYear) {
  const known = [...byYear.keys()].map(Number);
  if (!known.length) return '<p class="empty-note">No paid purchases in your history yet.</p>';
  const years = [];
  for (let y = Math.min(...known); y <= Math.max(...known); y++) years.push(String(y));
  const max = Math.max(...[...byYear.values()].map((v) => v.amount), 1);

  return years
    .map((y, i) => {
      const v = byYear.get(y) ?? { amount: 0, count: 0 };
      const pct = v.amount ? Math.max(1.5, (v.amount / max) * 100) : 0;
      const full = money(Math.round(v.amount), currency);
      return `<button type="button" class="year" data-year="${y}" aria-pressed="${selectedYear === y}"
          aria-label="${esc(`${y}: ${full}, ${plural(v.count, 'purchase')}`)}" ${tip(`${y} · ${full}`, plural(v.count, 'purchase'))}>
        <span class="plot">
          <span class="amt">${v.amount ? esc(money(v.amount, currency, { compact: true })) : '–'}</span>
          <span class="col" style="height:${pct}%; --i:${i}"></span>
        </span>
        <span class="yr">${y}</span>
      </button>`;
    })
    .join('');
}

/** Years × months grid. A square-root scale keeps one huge month from washing out the rest. */
export function heatmap(byMonth, currency, selectedMonth, today = new Date()) {
  const keys = [...byMonth.keys()];
  if (!keys.length) return { grid: '<p class="empty-note">No purchases to plot.</p>', legend: '' };
  const firstYear = Math.min(...keys.map((k) => Number(k.slice(0, 4))));
  const thisYear = today.getFullYear();
  const thisMonth = `${thisYear}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const max = Math.max(...[...byMonth.values()].map((v) => v.amount), 1);

  let grid = '<span></span>' + Array.from({ length: 12 }, (_, m) => `<span class="hm-col">${esc(monthName(m, 'narrow'))}</span>`).join('');
  for (let y = thisYear; y >= firstYear; y--) {
    grid += `<span class="hm-row">${y}</span>`;
    for (let m = 0; m < 12; m++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const v = byMonth.get(key);
      const label = `${monthName(m, 'long')} ${y}`;
      if (key > thisMonth) {
        grid += `<button type="button" class="cell" disabled aria-label="${esc(label)}"></button>`;
        continue;
      }
      const level = v ? Math.min(5, Math.max(1, Math.ceil(Math.sqrt(v.amount / max) * 5))) : 0;
      const body = v ? `${money(Math.round(v.amount), currency)} · ${plural(v.count, 'purchase')}` : 'No purchases';
      grid += `<button type="button" class="cell" data-month="${key}" data-l="${level}" aria-pressed="${selectedMonth === key}"
        aria-label="${esc(`${label}: ${body}`)}" ${tip(label, body)}></button>`;
    }
  }
  const legend = `Less ${[0, 1, 2, 3, 4, 5].map((l) => `<i style="background:var(--seq-${l})"></i>`).join('')} More`;
  return { grid, legend };
}

const SLOTS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

/**
 * One stacked bar plus a labelled legend. Past four parts, the rest fold into "Other".
 * parts: [{ name, count, color? }]; a part's own color wins over its slot, so meaning-bearing colors stay put.
 */
export function stackChart(title, items, unit) {
  const total = items.reduce((s, x) => s + x.count, 0) || 1;
  const top = items.filter((x) => x.count).slice(0, SLOTS.length);
  const rest = items.filter((x) => x.count).slice(SLOTS.length).reduce((s, x) => s + x.count, 0);
  const parts = top.map((s, i) => ({ ...s, color: s.color ?? SLOTS[i] }));
  if (rest) parts.push({ name: 'Other', count: rest, color: 'var(--series-other)' });

  const pct = (n) => `${Math.round((n / total) * 100)}%`;
  return `<div class="stack-block">
    <p class="stack-title">${esc(title)}</p>
    <div class="stack" role="img" aria-label="${esc(`${title}: ${parts.map((p) => `${p.name} ${p.count}`).join(', ')}`)}">
      ${parts.map((p) => `<span style="flex:${p.count}; background:${p.color}" ${tip(p.name, `${plural(p.count, unit)} · ${pct(p.count)}`)}></span>`).join('')}
    </div>
    <ul class="legend">
      ${parts.map((p) => `<li><span class="sw" style="background:${p.color}"></span><span>${esc(p.name)}</span><span class="v">${p.count.toLocaleString()}</span><span class="p">${pct(p.count)}</span></li>`).join('')}
    </ul>
  </div>`;
}

/**
 * Ranked horizontal bars. Rows with `filter` become buttons that toggle that filter.
 * rows: [{ name, value, label, filter?, pressed? }]
 */
export function rankList(rows, { empty = 'Nothing yet.' } = {}) {
  if (!rows.length) return `<p class="empty-note">${esc(empty)}</p>`;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<ul class="ranks">${rows
    .map((r, i) => {
      const tag = r.filter ? 'button' : 'div';
      const attrs = r.filter ? `type="button" data-filter="${esc(r.filter)}" aria-pressed="${Boolean(r.pressed)}"` : '';
      return `<li><${tag} class="rank" ${attrs}>
        <span class="n">${esc(r.name)}</span><span class="v">${esc(r.label)}</span>
        <span class="track"><span class="bar" style="width:${Math.max(2, (r.value / max) * 100)}%; --i:${i}"></span></span>
      </${tag}></li>`;
    })
    .join('')}</ul>`;
}
