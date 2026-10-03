// Everything the "Booking options" panel offers for one trip: the airline itself first (recommended),
// then comparison sites. flexfare doesn't sell tickets; these all open the seller's own site.
import { AIRLINES, type TripArgs } from './airlines.js';
import type { BookingOption } from './types';
import { shortDate } from './weeks.js';

export type { TripArgs };
export interface Carrier {
  code: string;
  name: string;
}

export interface BookingArgs extends TripArgs {
  /** Airlines on the itinerary, first flight's airline first. */
  carriers?: Carrier[];
  aviasalesUrl?: string;
}

const yymmdd = (iso: string) => iso.replaceAll('-', '').slice(2);
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const plural = (n: number) => `${n} ${n === 1 ? 'adult' : 'adults'}`;

/** The trip in words, for sites we can't pre-fill: "SFO to LIS · Tue Oct 20, back Tue Nov 3 · 1 adult · Economy". */
export function tripSummary(t: TripArgs): string {
  const dates = t.backDate ? `${shortDate(t.outDate)}, back ${shortDate(t.backDate)}` : shortDate(t.outDate);
  const cabin = { economy: 'Economy', premium: 'Premium economy', business: 'Business' }[t.cabin];
  return `${t.from} to ${t.to} · ${dates} · ${plural(t.travelers)} · ${cabin}`;
}

export const googleFlightsUrl = (t: TripArgs) => {
  const cabin = t.cabin === 'economy' ? '' : ` ${t.cabin === 'premium' ? 'premium economy' : 'business'} class`;
  const when = t.backDate ? `on ${t.outDate} through ${t.backDate}` : `on ${t.outDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${t.from} to ${t.to} ${when}${cabin}`)}`;
};

export const skyscannerUrl = (t: TripArgs) => {
  const dates = t.backDate ? `${yymmdd(t.outDate)}/${yymmdd(t.backDate)}` : yymmdd(t.outDate);
  const cabin = { economy: 'economy', premium: 'premiumeconomy', business: 'business' }[t.cabin];
  return `https://www.skyscanner.com/transport/flights/${t.from.toLowerCase()}/${t.to.toLowerCase()}/${dates}/?${new URLSearchParams({ adultsv2: String(t.travelers), cabinclass: cabin, rtn: t.backDate ? '1' : '0' })}`;
};

export const expediaUrl = (t: TripArgs) => {
  const leg = (n: number, a: string, b: string, d: string) => `leg${n}=from:${a},to:${b},departure:${mdy(d)}TANYT`;
  const legs = [leg(1, t.from, t.to, t.outDate), ...(t.backDate ? [leg(2, t.to, t.from, t.backDate)] : [])].join('&');
  const cabin = { economy: 'economy', premium: 'premium_economy', business: 'business' }[t.cabin];
  return `https://www.expedia.com/Flights-Search?trip=${t.backDate ? 'roundtrip' : 'oneway'}&${legs}&passengers=adults:${t.travelers},children:0,infantinlap:N&options=cabinclass:${cabin}&mode=search`;
};

export const kayakUrl = (t: TripArgs) =>
  `https://www.kayak.com/flights/${t.from}-${t.to}/${t.outDate}${t.backDate ? `/${t.backDate}` : ''}/${t.travelers}adults?sort=bestflight_a`;

export function buildBookingOptions(a: BookingArgs): BookingOption[] {
  const options: BookingOption[] = [];

  // Directly by airline (up to two carriers, the first flight's airline recommended).
  const seen = new Set<string>();
  for (const c of a.carriers ?? []) {
    if (seen.has(c.code) || seen.size >= 2) continue;
    const airline = AIRLINES[c.code];
    if (!airline) continue;
    seen.add(c.code);
    const prefilled = !!airline.deep;
    options.push({
      id: `airline-${c.code}`,
      kind: 'airline',
      label: airline.name,
      url: airline.deep ? airline.deep(a) : airline.home,
      recommended: seen.size === 1,
      prefilled,
      note: prefilled
        ? airline.needsClick
          ? `Opens ${airline.name} with your trip filled in. Click Find Flights.`
          : `Opens ${airline.name} with your trip filled in.`
        : `Opens ${airline.name}'s website. It can't be pre-filled, so enter: ${tripSummary(a)}`,
    });
  }

  const site = (id: string, label: string, url: string, note: string): BookingOption => ({ id, kind: 'site', label, url, prefilled: true, note });
  options.push(
    site('google-flights', 'Google Flights', googleFlightsUrl(a), 'Opens with your trip filled in.'),
    site('skyscanner', 'Skyscanner', skyscannerUrl(a), 'Opens with your trip filled in.'),
    site('expedia', 'Expedia', expediaUrl(a), 'Opens with your trip filled in. Expedia sometimes asks you to confirm your search.'),
    site('kayak', 'Kayak', kayakUrl(a), 'Opens with your trip filled in.'),
  );
  if (a.aviasalesUrl) options.push(site('aviasales', 'Aviasales', a.aviasalesUrl, 'Opens this exact fare.'));
  return options;
}
