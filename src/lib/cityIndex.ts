// Instant city search over every city with an airline airport (about 3,500), bundled with the app and loaded
// on first use. It matches on every keystroke with no network: city name, any word of it, city or airport
// code (SFO, OAK), and country. Well-known cities rank first so "s" shows Seattle and Singapore, not Saarbrucken.
import { METRO } from '../shared/metro';
import { nearbyFor } from '../shared/nearby';
import type { City } from '../shared/types';

/** [cityCode, name, countryCode, ...airportCodes] */
export type CityRow = [string, string, string, ...string[]];

export interface CityIndex {
  search(query: string, limit?: number): City[];
  byCode(code: string): City | undefined;
  readonly size: number;
}

/** Roughly in order of how many people search for them. Position here is a ranking boost. */
export const PRIORITY = (
  'NYC LON PAR TYO LAX SFO CHI MIA WAS BOS SEA LAS DEN ATL DFW HOU PHX MSP DTT PHL SAN SLC PDX AUS ORL TPA BNA CLT HNL ANC ' +
  'YTO YVR YMQ YYC MEX CUN GDL BOG LIM SCL BUE SAO RIO PTY SJO HAV SJU NAS PUJ MBJ ' +
  'AMS FRA MUC BER ROM MIL MAD BCN LIS OPO DUB EDI MAN ZRH GVA VIE BRU CPH OSL STO HEL ATH IST PRG BUD WAW KRK VCE NAP FLR NCE LYS MRS AGP PMI IBZ VLC SVQ REK ' +
  'SIN HKG BKK KUL JKT MNL SEL OSA BJS SHA TPE DEL BOM BLR MAA CCU HYD DXB AUH DOH RUH JED TLV AMM CAI CMN ' +
  'SYD MEL BNE PER AKL CHC JNB CPT NBO ADD LOS ACC'
).split(' ');

/** "São Paulo" -> "sao paulo", "St. Louis" -> "st louis". */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

interface Entry {
  city: City;
  name: string;
  words: string[];
  code: string;
  airports: string[];
  country: string;
  boost: number;
}

function score(e: Entry, q: string, tokens: string[]): number {
  if (q === e.code) return 1000 + e.boost;
  if (q.length === 3 && e.airports.includes(q)) return 950 + e.boost;
  let best = 0;
  if (e.name === q) best = 900;
  else if (e.name.startsWith(q)) best = 800;
  else if (e.words.some((w) => w.startsWith(q))) best = 600;
  else if (tokens.length > 1 && tokens.every((t) => e.words.some((w) => w.startsWith(t)))) best = 550;
  else if (q.length >= 2 && e.name.includes(q)) best = 250;
  if (q.length >= 2 && (e.code.startsWith(q) || e.airports.some((a) => a.startsWith(q)))) best = Math.max(best, 500);
  if (q.length >= 3 && e.country.startsWith(q)) best = Math.max(best, 300);
  return best > 0 ? best + e.boost : 0;
}

export function buildCityIndex(rows: CityRow[], regionName: (countryCode: string) => string = (c) => c): CityIndex {
  const rank = new Map(PRIORITY.map((c, i) => [c, i]));
  const entries: Entry[] = rows.map(([code, name, cc, ...rowAirports]) => {
    const airports = METRO[code] ?? rowAirports;
    const country = regionName(cc);
    const r = rank.get(code);
    return {
      city: {
        code,
        name,
        country,
        airports,
        nearby: nearbyFor(code).map((n) => ({ airport: n.airport, city: n.city, transfer: n.transfer })),
      },
      name: normalize(name),
      words: normalize(name).split(' '),
      code: code.toLowerCase(),
      airports: airports.map((a) => a.toLowerCase()),
      country: normalize(country),
      boost: (r === undefined ? 0 : 200 - r * 0.8) + Math.min(airports.length, 5) * 4,
    };
  });
  const byCode = new Map(entries.map((e) => [e.city.code, e.city]));

  return {
    size: entries.length,
    byCode: (code) => byCode.get(code.toUpperCase()),
    search(query, limit = 8) {
      const q = normalize(query);
      if (!q) return PRIORITY.flatMap((c) => byCode.get(c) ?? []).slice(0, limit);
      const tokens = q.split(' ');
      return entries
        .map((e) => ({ e, s: score(e, q, tokens) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
        .slice(0, limit)
        .map((x) => x.e.city);
    },
  };
}

let loading: Promise<CityIndex> | null = null;

/** Loads the bundled city list the first time it's needed (a separate download, ~45 KB compressed). */
export function loadCityIndex(): Promise<CityIndex> {
  loading ??= import('../data/cities.json').then((m) => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      /* country names fall back to the two-letter code */
    }
    return buildCityIndex(m.default as CityRow[], (cc) => {
      try {
        return names?.of(cc) ?? cc;
      } catch {
        return cc;
      }
    });
  });
  return loading;
}
