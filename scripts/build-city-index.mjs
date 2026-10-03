// Rebuilds src/data/cities.json: every city that has a flightable airport, from Travelpayouts' free static data.
// Run with: npm run build:cities   (needs internet; the output is committed so the app never calls this).
import { writeFileSync, mkdirSync } from 'node:fs';

const base = 'https://api.travelpayouts.com/data/en';
const get = async (name) => {
  const res = await fetch(`${base}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
};
const [cities, airports] = await Promise.all([get('cities'), get('airports')]);

const byCity = new Map();
for (const a of airports) {
  if (!a.flightable || a.iata_type !== 'airport') continue;
  byCity.set(a.city_code, [...(byCity.get(a.city_code) ?? []), a.code]);
}

// [code, name, countryCode, airports...]
const rows = cities
  // Codes must be three plain A-Z letters (a few entries use look-alike Cyrillic letters, which the API rejects).
  .filter((c) => /^[A-Z]{3}$/.test(c.code) && c.has_flightable_airport && byCity.has(c.code) && c.name)
  .map((c) => [c.code, c.name.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim(), c.country_code, ...byCity.get(c.code).slice(0, 6)])
  .sort((a, b) => a[0].localeCompare(b[0]));

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/cities.json', JSON.stringify(rows));
console.log(`wrote ${rows.length} cities`);
