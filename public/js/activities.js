// What an hour of other fun costs, to put cost per hour of play in perspective.
// Rough 2026 prices for one person, on the cheap side so the comparison isn't stacked in gaming's favour.
// Keyed by the symbol Steam prints; other currencies get no comparison.
const PRICES = {
  Rp: { book: 100_000, movie: 50_000, themePark: 275_000, dinner: 100_000, concert: 1_000_000 },
  $: { book: 18, movie: 13.5, themePark: 100, dinner: 30, concert: 145 },
  '€': { book: 12, movie: 10, themePark: 60, dinner: 25, concert: 90 },
  '£': { book: 10, movie: 9, themePark: 55, dinner: 25, concert: 80 },
};

const ACTIVITIES = [
  { id: 'book', name: 'Reading a paperback', item: 'book', hours: 8 },
  { id: 'movie', name: 'Seeing a movie', item: 'ticket', hours: 2 },
  { id: 'themePark', name: 'A day at a theme park', item: 'day ticket', hours: 8 },
  { id: 'dinner', name: 'Dinner out', item: 'meal', hours: 1.5 },
  { id: 'concert', name: 'A concert', item: 'ticket', hours: 3 },
];

/** Other ways to spend an hour, cheapest per hour first. Empty for currencies without a price list. */
export function activitiesIn(currency) {
  const prices = PRICES[currency];
  if (!prices) return [];
  return ACTIVITIES.map((a) => ({ ...a, price: prices[a.id], perHour: Number((prices[a.id] / a.hours).toPrecision(3)) })).sort(
    (a, b) => a.perHour - b.perHour
  );
}

/**
 * Something that costs more per hour than `perHour`, and how many times more: a movie when it does
 * (everyone knows what a ticket costs), otherwise the cheapest activity that does. Null if none does.
 */
export function pricierThan(perHour, currency) {
  const pricier = activitiesIn(currency).filter((a) => a.perHour > perHour);
  const activity = pricier.find((a) => a.id === 'movie') ?? pricier[0];
  return activity ? { ...activity, ratio: activity.perHour / perHour } : null;
}
