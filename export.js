import { readFile, writeFile } from 'node:fs/promises';
import { BOM, gamesCsv, historyCsv } from './public/js/csv.js';

// npm run export                       -> steam-library.csv
// npm run export -- --history          -> steam-purchase-history.csv
// npm run export -- --out games.csv    -> custom file name
const args = process.argv.slice(2);
const history = args.includes('--history');
const outIndex = args.indexOf('--out');
const out = outIndex !== -1 ? args[outIndex + 1] : history ? 'steam-purchase-history.csv' : 'steam-library.csv';

let data;
try {
  data = JSON.parse(await readFile('data/library.json', 'utf8'));
} catch {
  console.error('No data/library.json yet. Run `npm run fetch` first.');
  process.exit(1);
}

const rows = history ? data.history ?? [] : data.games;
await writeFile(out, BOM + (history ? historyCsv(rows) : gamesCsv(rows)));
console.log(`Wrote ${rows.length} ${history ? 'transactions' : 'games'} to ${out}`);
