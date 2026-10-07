import { esc, money, totalAsShown, maskAmounts, setAmountsHidden, formatDate, timeAgo, yearsSince, hours, plural, hueFor, initials } from './format.js';
import { summarize, purchaseCategory, costPerHour, isBarelyPlayed, BARELY_PLAYED_MINUTES, HISTORY_CATEGORIES } from './stats.js';
import { yearChart, heatmap, stackChart, rankList } from './charts.js';
import { activitiesIn, pricierThan } from './activities.js';
import { BOM, gamesCsv, historyCsv, priceKind } from './csv.js';

const $ = (id) => document.getElementById(id);
const PAGE = 120;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const state = {
  data: null,
  summary: null,
  q: '', source: '', price: 'all', tag: '', year: null, month: null, barely: false,
  sort: 'recent',
  view: store.get('view') === 'table' ? 'table' : 'grid',
  hideAmounts: store.get('hideAmounts') === '1',
  openGame: null,
  limit: PAGE,
  hq: '', hcat: 'all', unmatchedOnly: false, hlimit: PAGE,
};

/* ---------- Shared bits ---------- */

const ICONS = {
  library: '<path d="M4 5h4v14H4zM10 5h4v14h-4zM16.5 5.5l3.5 1-3 12.5-3.5-1z"/>',
  avg: '<path d="M4 19h16M7 15l4-4 3 3 5-6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  refund: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  gamepad: '<path d="M7 8h10a5 5 0 0 1 4.9 6l-.4 1.9a2.6 2.6 0 0 1-4.6 1L15 15H9l-1.9 1.9a2.6 2.6 0 0 1-4.6-1L2.1 14A5 5 0 0 1 7 8z"/><path d="M7 10.5v3M5.5 12h3M15.5 11h.01M17.5 13h.01"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5z"/><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19v3H7.5"/>',
  cafe: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8.5 3.5v2.5M12.5 3.5v2.5"/>',
  movie: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21"/>',
  themePark: '<circle cx="12" cy="10" r="6.5"/><path d="M12 3.5v13M5.5 10h13M7.4 5.4l9.2 9.2M16.6 5.4l-9.2 9.2M8.5 21l3.5-11 3.5 11M6 21h12"/>',
  dinner: '<path d="M7 3v7M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 10v11M18 21V3c-2.5 1.5-3.5 4.5-3.5 8.5H18"/>',
  concert: '<path d="M9 18V5.5l11-2.5v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
};

const icon = (name) => `<span class="kpi-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg></span>`;

/** Cover art with a generated fallback for games Steam has no art for. */
function art(src, name, { wide = false, label = false } = {}) {
  const ph = `<span class="ph" style="--h:${hueFor(name)}">${esc(initials(name))}${label ? `<small>${esc(name)}</small>` : ''}</span>`;
  if (!src) return ph;
  return `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" data-fallback="${esc(name)}" ${wide ? 'data-wide' : ''}>`;
}

// Broken image (delisted game, missing asset) -> swap in the placeholder.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || img.dataset.fallback == null) return;
  const cover = img.closest('.cover');
  cover?.classList.remove('wide');
  img.outerHTML = `<span class="ph" style="--h:${hueFor(img.dataset.fallback)}">${esc(initials(img.dataset.fallback))}${cover ? `<small>${esc(img.dataset.fallback)}</small>` : ''}</span>`;
}, true);

function priceLabel(g, { compact = false } = {}) {
  const kind = priceKind(g);
  if (kind === 'exact') return g.price === 0 ? 'Free' : money(g.price, g.currency, { compact });
  if (kind === 'bundle') return 'Bundle';
  return g.source === 'Complimentary' ? 'Free' : g.source ?? '–';
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- Hero & highlights ---------- */

const LEVEL_TIERS = ['#9b9b9b', '#c02942', '#d95b43', '#fecc23', '#467a3c', '#4e8ddb', '#7652c9', '#c252c9', '#9a3a5a', '#997c52'];

function renderHero({ animate = true } = {}) {
  const { profile, games } = state.data;
  const s = state.summary;

  // Backdrop: the most recent game you paid for that has wide art.
  const featured = [...games]
    .filter((g) => g.purchase && g.app?.art.hero)
    .sort((a, b) => (b.acquired ?? '').localeCompare(a.acquired ?? ''))[0] ?? games.find((g) => g.app?.art.hero);
  if (featured) {
    $('hero-art').style.setProperty('--art', `url("${encodeURI(featured.app.art.hero)}")`);
    $('hero-credit').textContent = `Art: ${featured.app.name}`;
  }

  if (profile) {
    document.title = `${profile.name} · How much I spent on Steam`;
    $('persona').textContent = profile.name;
    const avatar = $('avatar');
    avatar.href = profile.profileUrl;
    avatar.target = '_blank';
    avatar.rel = 'noopener';
    const status = profile.onlineState === 'in-game' ? 'in-game' : profile.onlineState === 'online' ? 'online' : 'offline';
    avatar.innerHTML = `${profile.avatar ? `<img src="${esc(profile.avatar)}" alt="">` : '<span class="avatar-skeleton"></span>'}
      <span class="status ${status}" title="${esc(profile.stateMessage ?? status)}"></span>`;

    const years = yearsSince(profile.memberSince);
    const chips = [];
    if (profile.level != null) {
      chips.push(`<li><span class="level" style="--tier:${LEVEL_TIERS[Math.floor(profile.level / 10) % 10]}">${profile.level}</span> Steam level</li>`);
    }
    if (profile.memberSince) {
      chips.push(`<li>Member since <strong>${esc(formatDate(profile.memberSince, '', { month: 'short', year: 'numeric' }))}</strong>${years ? ` · ${plural(years, 'yr')}` : ''}</li>`);
    }
    if (profile.ownedAppCount) chips.push(`<li><strong>${profile.ownedAppCount.toLocaleString()}</strong> apps on account</li>`);
    if (profile.wishlistCount) chips.push(`<li><strong>${profile.wishlistCount.toLocaleString()}</strong> wishlisted</li>`);
    chips.push(`<li style="all:unset"><a class="btn glass" href="${esc(profile.profileUrl)}" target="_blank" rel="noopener">View on Steam ↗</a></li>`);
    $('hero-chips').innerHTML = chips.join('');
  } else {
    $('avatar').innerHTML = `<span class="ph" style="--h:210; border-radius:23px">?</span>`;
    $('hero-chips').innerHTML = `<li>Re-run <strong>npm run fetch</strong> to load your profile</li>`;
  }

  const range = s.first ? `${formatDate(s.first, '', { month: 'short', year: 'numeric' })} – ${formatDate(s.last, '', { month: 'short', year: 'numeric' })}` : '';
  $('hero-stat').innerHTML = `
    <p class="eyebrow">Spent on games</p>
    <p class="big-number" id="big-number">${esc(money(Math.round(s.total), s.currency))}</p>
    <p class="sub">${plural(s.purchases.length, 'purchase')}${range ? ` · ${esc(range)}` : ''} · refunds excluded</p>`;
  if (animate && !state.hideAmounts) countUp($('big-number'), s.total, s.currency);
}

function countUp(el, target, currency) {
  if (reduceMotion || !target) return;
  const start = performance.now();
  const duration = 1400;
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(2, -10 * t);
    el.textContent = money(Math.round(target * (t === 1 ? 1 : eased)), currency);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function kpi(name, label, value, sub) {
  return `<article class="kpi">
    <p class="kpi-label">${icon(name)}${esc(label)}</p>
    <p class="kpi-value">${value}</p>
    <p class="kpi-sub">${sub}</p>
  </article>`;
}

function renderKpis() {
  const s = state.summary;
  const { games, hasPlaytime } = state.data;
  const cur = s.currency;
  const tiles = [];

  tiles.push(kpi('library', 'Library', games.length.toLocaleString(),
    `<strong>${s.paidCount}</strong> bought · <strong>${s.freeCount}</strong> free or gifted`));

  tiles.push(kpi('avg', 'Average price', s.avgPrice != null ? esc(money(Math.round(s.avgPrice), cur)) : '–',
    `across ${plural(s.pricedCount, 'game')} with an exact price`));

  const top = s.biggest[0];
  tiles.push(kpi('trophy', 'Biggest purchase', top ? esc(money(top.total.amount, cur)) : '–',
    top ? `${esc(top.items[0])}${top.items.length > 1 ? ` +${top.items.length - 1}` : ''} · ${esc(formatDate(top.date))}` : 'No purchases yet'));

  const { year, amount, previous } = s.ytd;
  let delta = `nothing by this point in ${year - 1}`;
  if (previous) {
    const pct = Math.round(((amount - previous) / previous) * 100);
    delta = `<span class="delta">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span> vs this time in ${year - 1}`;
  }
  tiles.push(kpi('calendar', `${year} so far`, esc(money(Math.round(amount), cur)), delta));

  tiles.push(kpi('refund', 'Refunds', s.refunds.count.toLocaleString(),
    s.refunds.amount ? `${esc(money(Math.round(s.refunds.amount), cur))} returned to you` : 'none requested'));

  if (hasPlaytime) {
    const h = s.playMinutes / 60;
    tiles.push(kpi('clock', 'Hours played', Math.round(h).toLocaleString(),
      s.perHour != null ? `≈ <strong>${esc(money(Math.round(s.perHour), cur))}</strong> per hour of play` : 'no playtime in games you bought'));
  }

  $('kpis').innerHTML = tiles.join('');
}

function renderCharts() {
  const s = state.summary;
  const years = $('years');
  years.innerHTML = yearChart(s.byYear, s.currency, state.year);
  years.classList.toggle('has-selection', state.year != null);
  let sub = `${money(Math.round(s.total), s.currency)} across ${plural(s.purchases.length, 'purchase')}`;
  if (s.otherCurrencyCount) sub += ` · ${s.otherCurrencyCount} in other currencies not counted`;
  $('years-sub').textContent = sub;

  const hm = heatmap(s.byMonth, s.currency, state.month);
  $('heatmap').innerHTML = hm.grid;
  $('heat-legend').innerHTML = hm.legend;
}

function renderBreakdowns() {
  const s = state.summary;
  const kinds = { exact: 0, bundle: 0, none: 0 };
  for (const g of state.data.games) kinds[priceKind(g)]++;
  $('sources').innerHTML =
    stackChart('Acquired through', s.sources, 'game') +
    stackChart('Price on record', [
      { name: 'Exact price', count: kinds.exact },
      { name: 'Part of a bundle', count: kinds.bundle },
      { name: 'Free or gifted', count: kinds.none },
    ], 'game');
  $('sources-sub').textContent = `${plural(state.data.games.length, 'game')} by acquisition method`;

  $('payments').innerHTML = rankList(
    s.payments.slice(0, 6).map((p) => ({
      name: p.name,
      value: p.amount,
      label: `${money(p.amount, s.currency, { compact: true })} · ${p.count}×`,
    })),
    { empty: 'No payments recorded.' }
  );
  renderTags();
}

function renderTags() {
  const tags = state.summary.tags.slice(0, 8);
  $('tags-panel').hidden = !tags.length;
  $('tags').innerHTML = rankList(
    tags.map((t) => ({ name: t.name, value: t.count, label: plural(t.count, 'game'), filter: t.name, pressed: state.tag === t.name }))
  );
}

/** A cost per hour: whole units for big currencies, cents for small ones. */
const rate = (amount, currency) => money(amount >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100, currency);

/** "4×", masked along with amounts, since the ratio and a known ticket price give the rate away. */
const times = (ratio) => (state.hideAmounts ? '•×' : `${(ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10).toLocaleString()}×`);

const costsMore = (c) => `${c.name} costs ${c.ratio < 1.1 ? 'about the same' : `${times(c.ratio)} as much`}`;

function renderValue() {
  const s = state.summary;
  const cur = s.currency;
  const activities = activitiesIn(cur);
  const wrap = $('value-wrap');
  wrap.hidden = !state.data.hasPlaytime || s.perHour == null || !activities.length;
  if (wrap.hidden) return;

  const anchor = pricierThan(s.perHour, cur);
  const top = activities.at(-1);
  let line = 'Pricier per hour than all of these, for now.';
  if (anchor) {
    line = `${esc(costsMore(anchor))}.`;
    if (top.id !== anchor.id) line += ` ${esc(top.name)}, ${esc(times(top.perHour / s.perHour))}.`;
  }

  $('value').innerHTML = `
    <div class="value-you">
      <p class="value-label">${icon('gamepad')}Your Steam games</p>
      <p class="value-number">${esc(rate(s.perHour, cur))}<span> per hour</span></p>
      <p class="value-detail">${esc(money(Math.round(s.total), cur))} over ${esc(plural(Math.round(s.paidPlayMinutes / 60), 'hour'))}</p>
      <p class="value-line">${line}</p>
      <p class="value-note">Every hour you play brings it down.</p>
    </div>
    <ul class="value-cards">${activities
      .map(
        (a) => `<li class="value-card">
          <p class="value-label">${icon(a.id)}<span class="value-x">${esc(times(a.perHour / s.perHour))}<small>your rate</small></span></p>
          <p class="value-name">${esc(a.name)}</p>
          <p class="value-rate">${esc(rate(a.perHour, cur))}<span>/h</span></p>
          <p class="value-detail">${esc(money(a.price, cur))} ${esc(a.item)}, ${a.hours.toLocaleString()}\u00a0h</p>
        </li>`
      )
      .join('')}</ul>`;
}

function renderFame() {
  const byPurchase = new Map();
  for (const g of state.data.games) if (g.purchase?.id && !byPurchase.has(g.purchase.id)) byPurchase.set(g.purchase.id, g);

  const top = state.summary.biggest.slice(0, 8);
  $('fame-wrap').hidden = !top.length;
  $('fame').innerHTML = top
    .map((p, i) => {
      const game = byPurchase.get(p.id);
      const name = p.items.length > 1 ? `${p.items[0]} +${p.items.length - 1} more` : p.items[0];
      return `<li><button type="button" class="fame-card" ${game ? `data-game="${state.data.games.indexOf(game)}"` : ''}
          aria-label="${esc(`#${i + 1}: ${name}, ${money(p.total.amount, p.total.currency)}`)}">
        ${art(game?.app?.art.header, p.items[0])}
        <span class="fame-rank">${i + 1}</span>
        <span class="fame-meta">
          <span class="fame-price">${esc(money(p.total.amount, p.total.currency))}</span>
          <span class="fame-name">${esc(name)} · ${esc(formatDate(p.date, p.dateRaw, { month: 'short', year: 'numeric' }))}</span>
        </span>
      </button></li>`;
    })
    .join('');
}

function renderShelf() {
  const { games, spent } = state.summary.barelyPlayed;
  const wrap = $('shelf-wrap');
  wrap.hidden = !state.data.hasPlaytime || !games.length;
  if (wrap.hidden) return;

  const h = BARELY_PLAYED_MINUTES / 60;
  const bundled = games.filter((g) => g.price == null).length;
  const priced = games.length - bundled;
  const sub = [];
  if (priced) sub.push(`${money(Math.round(spent), state.summary.currency)} on ${plural(priced, 'game')} you gave less than ${h} hours.`);
  if (bundled) sub.push(priced ? `${bundled} more came in bundles.` : `${plural(bundled, 'game')} from bundles you gave less than ${h} hours.`);
  sub.push(`Play one for ${h} hours and it's off the list.`);
  $('shelf-sub').textContent = sub.join(' ');
  $('shelf-all').textContent = `See all ${games.length.toLocaleString()} ${games.length === 1 ? 'regret' : 'regrets'}`;

  $('shelf').innerHTML = games
    .slice(0, 8)
    .map((g) => {
      const never = !g.playtimeMinutes;
      const played = never ? 'Never launched' : `Only ${hours(g.playtimeMinutes)}`;
      const price = priceKind(g) === 'bundle' ? 'In a bundle' : priceLabel(g);
      return `<li><button type="button" class="fame-card" data-game="${state.data.games.indexOf(g)}" aria-label="${esc(`${g.name}, ${price}, ${played}`)}">
        ${art(g.app?.art.header, g.name)}
        <span class="shelf-time${never ? ' never' : ''}">${esc(played)}</span>
        <span class="fame-meta">
          <span class="fame-price">${esc(price)}</span>
          <span class="fame-name">${esc(g.name)} · bought ${esc(formatDate(g.acquired, g.acquiredRaw, { month: 'short', year: 'numeric' }))}</span>
        </span>
      </button></li>`;
    })
    .join('');
}

/* ---------- Library ---------- */

const cmp = (a, b, dir = 1) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // blanks always last
  if (b == null) return -1;
  return (typeof a === 'number' ? a - b : String(a).localeCompare(String(b))) * dir;
};

const SORTS = {
  recent: (a, b) => cmp(a.acquired, b.acquired, -1),
  oldest: (a, b) => cmp(a.acquired, b.acquired),
  'price-desc': (a, b) => cmp(a.price, b.price, -1),
  'price-asc': (a, b) => cmp(a.price, b.price),
  name: (a, b) => cmp(a.name, b.name),
  released: (a, b) => cmp(a.app?.released, b.app?.released, -1),
  playtime: (a, b) => cmp(a.playtimeMinutes || null, b.playtimeMinutes || null, -1),
  value: (a, b) => cmp(costPerHour(a), costPerHour(b)),
};

function filteredGames() {
  const q = state.q.trim().toLowerCase();
  const match = (s) => s?.toLowerCase().includes(q);
  return state.data.games
    .filter(
      (g) =>
        (!q || match(g.name) || g.purchase?.items.some(match) || g.app?.developers.some(match) || g.app?.tags.some(match)) &&
        (!state.source || g.source === state.source) &&
        (state.price === 'all' || priceKind(g) === state.price) &&
        (!state.tag || g.app?.tags.includes(state.tag)) &&
        (!state.year || g.acquired?.startsWith(state.year)) &&
        (!state.month || g.acquired?.startsWith(state.month)) &&
        (!state.barely || isBarelyPlayed(g))
    )
    .sort((a, b) => SORTS[state.sort](a, b) || cmp(a.name, b.name));
}

function gameCard(g, i) {
  const idx = state.data.games.indexOf(g);
  const capsule = g.app?.art.capsule;
  const header = g.app?.art.header;
  const wide = !capsule && header;
  const kind = priceKind(g);
  const badge = g.app && g.app.type !== 'game' ? `<span class="badge">${esc(g.app.type)}</span>` : '';
  const sub = [formatDate(g.acquired, g.acquiredRaw), g.playtimeMinutes ? hours(g.playtimeMinutes) : null].filter(Boolean).join(' · ');
  return `<button type="button" class="card" data-game="${idx}" style="--i:${i}" aria-label="${esc(`${g.name}, ${priceLabel(g)}`)}">
    <span class="cover${wide ? ' wide' : ''}" ${wide ? `style="--img:url(&quot;${esc(encodeURI(header))}&quot;)"` : ''}>
      ${art(capsule ?? header, g.name, { label: true })}
      <span class="tagline">${badge}</span>
      <span class="price-tag ${kind}">${esc(priceLabel(g, { compact: true }))}</span>
    </span>
    <span class="card-title">${esc(g.name)}</span>
    <span class="card-sub">${esc(sub)}</span>
  </button>`;
}

const TABLE_SORTS = { name: ['name', 'name'], acquired: ['recent', 'oldest'], price: ['price-desc', 'price-asc'], playtime: ['playtime', 'playtime'] };

function gameTable(rows) {
  const { hasPlaytime } = state.data;
  const th = (key, label, cls = '') => {
    const [first, second] = TABLE_SORTS[key];
    const sort = state.sort === first ? (key === 'name' ? 'ascending' : 'descending') : state.sort === second ? 'ascending' : 'none';
    return `<th class="${cls}" aria-sort="${sort}"><button type="button" data-sort-key="${key}">${label}</button></th>`;
  };
  const body = rows
    .map((g) => {
      const idx = state.data.games.indexOf(g);
      const kind = priceKind(g);
      const price =
        kind === 'exact'
          ? esc(priceLabel(g))
          : kind === 'bundle'
            ? `<span class="muted">Part of ${esc(money(g.purchase.total?.amount, g.purchase.total?.currency))}</span><span class="sub">${esc(g.purchase.items.length > 1 ? plural(g.purchase.items.length, 'item') : 'shared checkout')}</span>`
            : '<span class="muted">–</span>';
      return `<tr class="clickable" data-game="${idx}">
        <td><div class="game-cell">
          <span class="thumb">${art(g.app?.art.header, g.name)}</span>
          <span><button type="button" class="game-name" data-game="${idx}">${esc(g.name)}</button>
          <span class="sub">${esc(g.app?.developers.slice(0, 2).join(', ') ?? '')}</span></span>
        </div></td>
        <td class="date">${esc(formatDate(g.acquired, g.acquiredRaw))}</td>
        <td>${esc(g.source ?? '')}</td>
        ${hasPlaytime ? `<td class="num">${esc(hours(g.playtimeMinutes) || '–')}</td>` : ''}
        <td class="num">${price}</td>
      </tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr>${th('name', 'Game')}${th('acquired', 'Acquired')}<th>Source</th>${hasPlaytime ? th('playtime', 'Played', 'num') : ''}${th('price', 'Paid', 'num')}</tr></thead>
    <tbody>${body || `<tr><td colspan="5" class="empty-row">No games match these filters.</td></tr>`}</tbody>
  </table></div>`;
}

function renderActiveFilters() {
  const chips = [];
  if (state.year) chips.push(['year', `Year ${state.year}`]);
  if (state.month) chips.push(['month', formatDate(`${state.month}-01`, '', { month: 'long', year: 'numeric' })]);
  if (state.tag) chips.push(['tag', `Tag: ${state.tag}`]);
  if (state.barely) chips.push(['barely', `Played under ${BARELY_PLAYED_MINUTES / 60} h`]);
  $('active-filters').innerHTML = chips
    .map(([key, label]) => `<button type="button" class="chip removable" data-clear="${key}" aria-label="Remove filter ${esc(label)}">${esc(label)}</button>`)
    .join('');
}

function renderLibrary() {
  const rows = filteredGames();
  const shown = rows.slice(0, state.limit);
  $('count').textContent = `${rows.length.toLocaleString()} of ${plural(state.data.games.length, 'game')}`;
  $('export-view-count').textContent = rows.length.toLocaleString();

  if (state.view === 'grid') {
    $('games').innerHTML = rows.length
      ? `<div class="grid">${shown.map(gameCard).join('')}</div>`
      : `<div class="table-wrap"><p class="empty-row">No games match these filters. Try clearing the search or a filter chip.</p></div>`;
  } else {
    $('games').innerHTML = gameTable(shown);
  }

  const more = $('more');
  more.hidden = rows.length <= state.limit;
  more.textContent = `Show more (${(rows.length - state.limit).toLocaleString()} left)`;
  renderActiveFilters();
}

/** Redraw everything a filter change affects. */
function refresh({ charts = false } = {}) {
  state.limit = PAGE;
  if (charts) {
    renderCharts();
    renderTags();
  }
  renderLibrary();
}

/* ---------- Purchase history ---------- */

const historyKey = (p) => p.id ?? `${p.date}|${p.items.join('|')}`;

function filteredHistory() {
  const q = state.hq.trim().toLowerCase();
  return state.data.history.filter(
    (p) =>
      (state.hcat === 'all' || purchaseCategory(p) === state.hcat) &&
      (!state.unmatchedOnly || state.unlinked.has(historyKey(p))) &&
      (!q || p.items.some((i) => i.toLowerCase().includes(q)) || p.type.toLowerCase().includes(q) || p.payment?.toLowerCase().includes(q))
  );
}

function renderHistoryCats() {
  const counts = new Map();
  for (const p of state.data.history) counts.set(purchaseCategory(p), (counts.get(purchaseCategory(p)) ?? 0) + 1);
  const cats = [{ id: 'all', label: 'All', n: state.data.history.length }, ...HISTORY_CATEGORIES.map((c) => ({ ...c, n: counts.get(c.id) ?? 0 })).filter((c) => c.n)];
  $('hcats').innerHTML = cats
    .map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${state.hcat === c.id}">${esc(c.label)} <span class="c">${c.n}</span></button>`)
    .join('');
}

function renderHistory() {
  const rows = filteredHistory();
  $('hcount').textContent = `${rows.length.toLocaleString()} of ${plural(state.data.history.length, 'transaction')}`;
  $('export-hview-count').textContent = rows.length.toLocaleString();

  const byPurchase = new Map();
  state.data.games.forEach((g, i) => g.purchase?.id && !byPurchase.has(g.purchase.id) && byPurchase.set(g.purchase.id, i));

  $('hrows').innerHTML = rows.length
    ? rows
        .slice(0, state.hlimit)
        .map((p) => {
          const cat = purchaseCategory(p);
          const game = byPurchase.get(p.id);
          const shown = p.items.map(maskAmounts);
          const items = shown.length > 2 ? `${esc(shown.slice(0, 2).join(', '))} <span class="muted">+${shown.length - 2} more</span>` : esc(shown.join(', '));
          return `<tr class="${p.refunded ? 'refunded' : ''} ${game != null ? 'clickable' : ''}" ${game != null ? `data-game="${game}"` : ''} title="${esc(shown.join('\n'))}">
            <td class="date">${esc(formatDate(p.date, p.dateRaw))}</td>
            <td>${items}</td>
            <td><span class="type-pill ${cat}">${esc(p.type)}</span></td>
            <td class="muted">${esc(maskAmounts(p.payment))}</td>
            <td class="num">${esc(totalAsShown(p.total))}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="5" class="empty-row">No transactions match.</td></tr>`;

  const more = $('hmore');
  more.hidden = rows.length <= state.hlimit;
  more.textContent = `Show more (${(rows.length - state.hlimit).toLocaleString()} left)`;
}

/* ---------- Detail drawer ---------- */

function openGame(idx) {
  const g = state.data.games[idx];
  if (!g) return;
  const app = g.app;
  const kind = priceKind(g);
  const cph = costPerHour(g);
  const pricier = cph != null ? pricierThan(cph, g.currency) : null;
  const facts = [
    ['Paid', kind === 'exact' ? money(g.price, g.currency) : kind === 'bundle' ? 'In a bundle' : 'Nothing', kind === 'bundle' ? `of ${money(g.purchase.total?.amount, g.purchase.total?.currency)}` : ''],
    ['Acquired', formatDate(g.acquired, g.acquiredRaw), g.acquired ? timeAgo(g.acquired) : ''],
    ['Source', g.source ?? '–', ''],
    app?.released ? ['Released', formatDate(app.released), ''] : null,
    g.playtimeMinutes != null ? ['Played', hours(g.playtimeMinutes) || '0 h', g.lastPlayed ? `last ${formatDate(g.lastPlayed)}` : ''] : null,
    cph != null ? ['Cost per hour', rate(cph, g.currency), pricier ? costsMore(pricier) : ''] : null,
  ].filter(Boolean);

  const p = g.purchase;
  const receipt = p
    ? `<section class="receipt">
        <h3>${p.items.length > 1 ? 'Bought together' : 'Receipt'}</h3>
        ${p.items.length > 1 ? `<ul>${p.items.map((i) => `<li>${esc(maskAmounts(i))}</li>`).join('')}</ul>` : ''}
        <dl>
          <dt>Date</dt><dd>${esc(formatDate(p.date))}</dd>
          <dt>Type</dt><dd>${esc(p.type)}</dd>
          ${p.payment ? `<dt>Payment</dt><dd>${esc(maskAmounts(p.payment))}</dd>` : ''}
          <dt>Total</dt><dd><strong>${esc(totalAsShown(p.total))}</strong></dd>
        </dl>
        ${kind === 'bundle' ? `<p class="note">This checkout covered more than one game, so its total isn't split per game.</p>` : ''}
        ${g.matchedBy === 'date' ? `<p class="note">Matched by purchase date rather than by name.</p>` : ''}
      </section>`
    : '';

  const actions = [];
  if (app) {
    actions.push(`<a class="btn primary" href="https://store.steampowered.com/app/${app.appid}/" target="_blank" rel="noopener">Store page ↗</a>`);
    actions.push(`<a class="btn" href="steam://nav/games/details/${app.appid}">Open in Steam</a>`);
    actions.push(`<a class="btn" href="https://steamcommunity.com/app/${app.appid}" target="_blank" rel="noopener">Community hub ↗</a>`);
  }
  if (p?.id) actions.push(`<a class="btn" href="https://help.steampowered.com/en/wizard/HelpWithPurchase?transid=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Purchase help ↗</a>`);

  state.openGame = idx;
  const drawer = $('drawer');
  drawer.innerHTML = `
    <div class="drawer-hero">
      ${art(app?.art.hero ?? app?.art.header, g.name)}
      <button type="button" class="drawer-close" data-close aria-label="Close">✕</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-head">
        <span class="drawer-capsule">${art(app?.art.capsule ?? app?.art.header, g.name)}</span>
        <div>
          <h2 id="drawer-title">${esc(g.name)}</h2>
          ${app?.developers.length ? `<p class="devs">${esc(app.developers.join(', '))}${app.publishers.length && app.publishers.join() !== app.developers.join() ? ` · ${esc(app.publishers.join(', '))}` : ''}</p>` : ''}
        </div>
      </div>
      ${app?.tags.length ? `<ul class="tag-row">${app.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <dl class="facts">${facts.map(([k, v, small]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(v)}${small ? `<small>${esc(small)}</small>` : ''}</dd></div>`).join('')}</dl>
      ${receipt}
      <div class="actions">${actions.join('')}</div>
    </div>`;
  if (!drawer.open) drawer.showModal();
}

/* ---------- Export ---------- */

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportData(kind) {
  const stamp = new Date().toISOString().slice(0, 10);
  const csv = 'text/csv;charset=utf-8';
  if (kind === 'games-view' || kind === 'games-all') {
    const rows = kind === 'games-all' ? state.data.games : filteredGames();
    download(`steam-library-${stamp}.csv`, BOM + gamesCsv(rows), csv);
    toast(`Exported ${plural(rows.length, 'game')} to CSV`);
  } else if (kind === 'history-view' || kind === 'history-all') {
    const rows = kind === 'history-all' ? state.data.history : filteredHistory();
    download(`steam-purchase-history-${stamp}.csv`, BOM + historyCsv(rows), csv);
    toast(`Exported ${plural(rows.length, 'transaction')} to CSV`);
  } else if (kind === 'json') {
    download(`steam-library-${stamp}.json`, JSON.stringify(state.data, null, 2), 'application/json');
    toast('Exported full backup as JSON');
  }
}

/* ---------- Wiring ---------- */

function setupMenu() {
  const menu = $('export-menu');
  const button = menu.querySelector('button');
  const list = $('export-list');
  const setOpen = (open) => {
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) list.querySelector('[role="menuitem"]').focus();
  };
  menu.hidden = false;
  button.addEventListener('click', () => setOpen(list.hidden));
  list.addEventListener('click', (e) => {
    const item = e.target.closest('[data-export]');
    if (!item) return;
    exportData(item.dataset.export);
    setOpen(false);
    button.focus();
  });
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !list.hidden) { setOpen(false); button.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (!list.hidden && !menu.contains(e.target)) setOpen(false);
  });
}

function setupTheme() {
  $('theme').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
  });
}

function setupPrivacy() {
  const button = $('privacy');
  const apply = () => {
    setAmountsHidden(state.hideAmounts);
    button.setAttribute('aria-pressed', String(state.hideAmounts));
    button.title = `${state.hideAmounts ? 'Show' : 'Hide'} amounts (H)`;
  };
  const toggle = () => {
    state.hideAmounts = !state.hideAmounts;
    store.set('hideAmounts', state.hideAmounts ? '1' : '0');
    apply();
    if (!state.data) return;
    renderHero({ animate: false });
    renderKpis();
    renderCharts();
    renderBreakdowns();
    renderValue();
    renderFame();
    renderShelf();
    renderLibrary();
    renderHistory();
    if ($('drawer').open) openGame(state.openGame);
    toast(state.hideAmounts ? 'Amounts hidden' : 'Amounts visible');
  };
  apply();
  button.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'h' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target.closest('input, select, textarea, [contenteditable]')) return;
    toggle();
  });
}

function setupTooltip() {
  const tipEl = $('tooltip');
  const show = (target, x, y) => {
    tipEl.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = target.dataset.tipTitle;
    tipEl.append(strong, target.dataset.tipBody ?? '');
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = `${Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
    tipEl.style.top = `${Math.max(8, y - r.height - 14)}px`;
  };
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tip-title]');
    if (t) show(t, e.clientX, e.clientY);
    else tipEl.hidden = true;
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip-title]');
    if (!t) return (tipEl.hidden = true);
    const r = t.getBoundingClientRect();
    show(t, r.left + r.width / 2, r.top);
  });
  document.addEventListener('scroll', () => (tipEl.hidden = true), { passive: true });
}

function setupTabs() {
  const tabs = [$('tab-library'), $('tab-history')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });
  return select;
}

function setRadio(group, attr, value) {
  for (const b of group.querySelectorAll(`[${attr}]`)) b.setAttribute('aria-checked', String(b.getAttribute(attr) === value));
}

function bindEvents(selectTab) {
  const scrollToLibrary = () => {
    selectTab($('tab-library'));
    $('library').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  $('years').addEventListener('click', (e) => {
    const b = e.target.closest('.year');
    if (!b) return;
    state.year = state.year === b.dataset.year ? null : b.dataset.year;
    state.month = null;
    refresh({ charts: true });
  });
  $('heatmap').addEventListener('click', (e) => {
    const c = e.target.closest('.cell[data-month]');
    if (!c) return;
    state.month = state.month === c.dataset.month ? null : c.dataset.month;
    state.year = null;
    refresh({ charts: true });
    if (state.month) scrollToLibrary();
  });
  $('tags').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    state.tag = state.tag === b.dataset.filter ? '' : b.dataset.filter;
    refresh({ charts: true });
    if (state.tag) scrollToLibrary();
  });
  $('active-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-clear]');
    if (!b) return;
    state[b.dataset.clear] = b.dataset.clear === 'tag' ? '' : null;
    refresh({ charts: true });
  });

  $('q').addEventListener('input', (e) => { state.q = e.target.value; refresh(); });
  $('source').addEventListener('change', (e) => { state.source = e.target.value; refresh(); });
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; refresh(); });
  $('price-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-price]');
    if (!b) return;
    state.price = b.dataset.price;
    setRadio($('price-filter'), 'data-price', state.price);
    refresh();
  });
  $('view-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    state.view = b.dataset.view;
    store.set('view', state.view);
    setRadio($('view-toggle'), 'data-view', state.view);
    renderLibrary();
  });
  $('more').addEventListener('click', () => { state.limit += PAGE; renderLibrary(); });
  $('export-view').addEventListener('click', () => exportData('games-view'));

  $('games').addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort-key]');
    if (sortBtn) {
      const [first, second] = TABLE_SORTS[sortBtn.dataset.sortKey];
      state.sort = state.sort === first && first !== second ? second : first;
      $('sort').value = state.sort;
      return renderLibrary();
    }
    const g = e.target.closest('[data-game]');
    if (g) openGame(Number(g.dataset.game));
  });
  for (const row of [$('fame'), $('shelf')]) {
    row.addEventListener('click', (e) => {
      const g = e.target.closest('[data-game]');
      if (g) openGame(Number(g.dataset.game));
    });
  }
  $('shelf-all').addEventListener('click', () => {
    state.barely = true;
    state.sort = 'price-desc'; // same order as the row above
    $('sort').value = state.sort;
    refresh();
    scrollToLibrary();
  });

  $('hq').addEventListener('input', (e) => { state.hq = e.target.value; state.hlimit = PAGE; renderHistory(); });
  $('unmatched').addEventListener('change', (e) => { state.unmatchedOnly = e.target.checked; state.hlimit = PAGE; renderHistory(); });
  $('hcats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.hcat = b.dataset.cat;
    state.hlimit = PAGE;
    renderHistoryCats();
    renderHistory();
  });
  $('hmore').addEventListener('click', () => { state.hlimit += PAGE; renderHistory(); });
  $('export-hview').addEventListener('click', () => exportData('history-view'));
  $('hrows').addEventListener('click', (e) => {
    const row = e.target.closest('[data-game]');
    if (row) openGame(Number(row.dataset.game));
  });

  const drawer = $('drawer');
  drawer.addEventListener('click', (e) => {
    // Clicks on the backdrop land on the dialog element itself.
    if (e.target === drawer || e.target.closest('[data-close]')) drawer.close();
  });
}

async function main() {
  setupTheme();
  setupPrivacy();
  setupTooltip();

  const res = await fetch('/data/library.json', { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) {
    $('hero-stat').innerHTML = '';
    $('hero-chips').innerHTML = '<li>No data fetched yet</li>';
    $('empty').hidden = false;
    return;
  }
  const data = await res.json();
  data.history ??= [];
  data.unlinkedPurchases ??= [];
  state.data = data;
  state.summary = summarize(data);
  state.unlinked = new Set(data.unlinkedPurchases.map(historyKey));

  const synced = $('synced');
  synced.hidden = false;
  synced.textContent = `Synced ${timeAgo(data.generatedAt)}`;
  synced.title = `${new Date(data.generatedAt).toLocaleString()}. Run "npm run fetch" to refresh.`;

  $('library-count').textContent = data.games.length.toLocaleString();
  $('history-count').textContent = data.history.length.toLocaleString();
  const sources = [...new Set(data.games.map((g) => g.source).filter(Boolean))].sort();
  $('source').insertAdjacentHTML('beforeend', sources.map((s) => `<option>${esc(s)}</option>`).join(''));
  for (const o of document.querySelectorAll('[data-needs-playtime]')) o.hidden = !data.hasPlaytime;
  setRadio($('view-toggle'), 'data-view', state.view);

  setupMenu();
  const selectTab = setupTabs();
  bindEvents(selectTab);

  $('app').hidden = false;
  renderHero();
  renderKpis();
  renderCharts();
  renderBreakdowns();
  renderValue();
  renderFame();
  renderShelf();
  renderLibrary();
  renderHistoryCats();
  renderHistory();
}

main();
