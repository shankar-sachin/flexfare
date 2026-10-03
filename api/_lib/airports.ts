// City code -> the airports flights can use, from Travelpayouts' free static airport list plus our metro overrides.
import { METRO } from '../../src/shared/metro.js';

let airportsByCity: Promise<Map<string, string[]>> | null = null;

export function loadAirports(): Promise<Map<string, string[]>> {
  airportsByCity ??= (async () => {
    const map = new Map<string, string[]>();
    try {
      const res = await fetch('https://api.travelpayouts.com/data/en/airports.json', { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        for (const a of (await res.json()) as { code: string; city_code: string; flightable?: boolean; iata_type?: string }[]) {
          if (!a.flightable || a.iata_type !== 'airport') continue;
          map.set(a.city_code, [...(map.get(a.city_code) ?? []), a.code]);
        }
      }
    } catch {
      /* airports fall back to the city code */
    }
    if (map.size === 0) airportsByCity = null; // retry next time
    return map;
  })();
  return airportsByCity;
}

/** The airports for a city code (at most 6, to keep searches focused). Falls back to the code itself. */
export async function airportsFor(cityCode: string): Promise<string[]> {
  if (METRO[cityCode]) return METRO[cityCode];
  const list = (await loadAirports()).get(cityCode);
  return list && list.length > 0 ? list.slice(0, 6) : [cityCode];
}
