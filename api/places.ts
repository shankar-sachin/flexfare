// City autocomplete. Proxies the free Travelpayouts autocomplete and adds each city's airports.
import type { City } from '../src/shared/types.js';
import { requireUser } from './_lib/auth.js';
import { HttpError, handle, json } from './_lib/http.js';
import { loadAirports } from './_lib/airports.js';
import { nearbyFor } from './_lib/nearby.js';

interface Place {
  code: string;
  name: string;
  country_name?: string;
}

const memo = new Map<string, { at: number; cities: City[] }>();

export const GET = handle(async (req) => {
  await requireUser(req);
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 40);
  if (q.length < 2) return json(200, { cities: [] });

  const hit = memo.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < 3600_000) return json(200, { cities: hit.cities });

  const res = await fetch(`https://autocomplete.travelpayouts.com/places2?${new URLSearchParams({ term: q, locale: 'en' })}&types[]=city`, {
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!res?.ok) throw new HttpError(502, 'UPSTREAM', 'City search is unavailable right now. Try again in a moment.');

  const airports = await loadAirports();
  const cities: City[] = ((await res.json()) as Place[]).slice(0, 6).map((p) => {
    const list = airports.get(p.code);
    return {
      code: p.code,
      name: p.name,
      country: p.country_name,
      airports: list && list.length > 0 ? list : [p.code],
      nearby: nearbyFor(p.code).map((n) => ({ airport: n.airport, city: n.city, transfer: n.transfer })),
    };
  });
  if (memo.size > 500) memo.clear();
  memo.set(q.toLowerCase(), { at: Date.now(), cities });
  return json(200, { cities });
});
