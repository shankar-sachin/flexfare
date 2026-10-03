// Mock data so the front-end runs with no backend.
// Swap `curateRoutes` in api.ts for a real call; nothing else needs to change.
import type { CuratedRoute, CurationResult, DayFare, SearchQuery, Week, WeekFare } from '../shared/types';
import { POPULAR_CITIES } from '../lib/popularCities';
import { parseISO, weeksBetween } from '../shared/weeks';

export { POPULAR_CITIES as CITIES } from '../lib/popularCities';

/** Deterministic pseudo-fare per week so the UI looks stable between renders. */
export function mockWeekFare(isoWeek: number): number {
  const base = [612, 548, 489, 521, 455, 472, 598, 734, 468, 503, 689, 812];
  return base[isoWeek % base.length];
}

export function mockWeekFares(weeks: Week[]): WeekFare[] {
  return weeks.map((w) => ({ isoWeek: w.isoWeek, lowest: mockWeekFare(w.isoWeek) }));
}

const addDays = (iso: string, n: number) => {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const dayFares = (week: Week | null, deltas: number[]): DayFare[] =>
  week ? deltas.map((delta, i) => ({ date: addDays(week.start, i), delta })) : [];

export function mockCuration(q: SearchQuery, weeks: Week[]): CurationResult {
  const out = q.departWeek;
  const back = q.returnWeek;
  const backStart = back ? back.start : null;
  const nights = (o: number, b: number) =>
    back ? weeksBetween(out, back) * 7 + (b - o) : 0;

  const outDays = dayFares(out, [23, 0, 8, 49, 82, 40, 77]);
  const backDays = dayFares(back, [6, 18, 0, 31, 44, 58, 26]);

  const routes: CuratedRoute[] = [
    {
      id: 'oak-bos-lis',
      fit: 94,
      price: 489,
      totalMinutes: 880,
      carrier: 'Northwind Air + Atlantica',
      fromAirport: 'OAK',
      toAirport: 'LIS',
      via: '1 stop · BOS',
      outDate: addDays(out.start, 1),
      backDate: backStart && addDays(backStart, 2),
      duration: '14h 40m',
      nights: nights(1, 2),
      badge: 'Best fit',
      why: 'Cheapest Tuesday in your window with a relaxed 1h 55m connection in Boston. Lands early, so you get a full first day.',
      reasons: [
        '$123 less than the only nonstop, for about 3½ extra hours each way.',
        'A 1h 55m connection: long enough to be safe, short enough not to hurt.',
        'Lands at 04:50, so your first day in Lisbon is a real day.',
        'Stay length lands inside the range you asked for.',
      ],
      scores: [
        { label: 'Price', value: 92 },
        { label: 'Travel time', value: 81 },
        { label: 'Connections', value: 88 },
        { label: 'Fits your weeks', value: 97 },
      ],
      outbound: {
        date: addDays(out.start, 1),
        totalDuration: '14h 40m',
        segments: [
          { from: 'Oakland (OAK)', to: 'Boston (BOS)', depart: '06:10', arrive: '14:45', flight: 'NW 412', carrier: 'Northwind Air', duration: '5h 35m', aircraft: 'A321' },
          { from: 'Boston (BOS)', to: 'Lisbon (LIS)', depart: '16:40', arrive: '04:50+1', flight: 'AT 218', carrier: 'Atlantica', duration: '7h 10m', aircraft: 'A330' },
        ],
        layovers: ['1h 55m in Boston · same terminal, bags checked through'],
      },
      inbound: backStart
        ? {
            date: addDays(backStart, 2),
            totalDuration: '16h 25m',
            segments: [
              { from: 'Lisbon (LIS)', to: 'Boston (BOS)', depart: '11:30', arrive: '14:10', flight: 'AT 217', carrier: 'Atlantica', duration: '7h 40m', aircraft: 'A330' },
              { from: 'Boston (BOS)', to: 'Oakland (OAK)', depart: '16:20', arrive: '19:55', flight: 'NW 415', carrier: 'Northwind Air', duration: '6h 35m', aircraft: 'A321' },
            ],
            layovers: ['2h 10m in Boston · re-clear US customs'],
          }
        : null,
      outDayFares: outDays,
      backDayFares: backDays,
      booking: [],
    },
    {
      id: 'sfo-lis',
      fit: 91,
      price: 612,
      totalMinutes: 665,
      carrier: 'Atlantica',
      fromAirport: 'SFO',
      toAirport: 'LIS',
      via: 'nonstop',
      outDate: addDays(out.start, 3),
      backDate: backStart && addDays(backStart, 6),
      duration: '11h 05m',
      nights: nights(3, 6),
      badge: 'Fastest',
      why: 'The only nonstop that fits your weeks. You pay $123 more than the top pick to save about 3½ hours each way.',
      reasons: ['Nonstop both ways.', 'Leaves at a civilised 15:20.', 'Most legroom of any option.'],
      scores: [
        { label: 'Price', value: 64 },
        { label: 'Travel time', value: 99 },
        { label: 'Connections', value: 100 },
        { label: 'Fits your weeks', value: 90 },
      ],
      outbound: {
        date: addDays(out.start, 3),
        totalDuration: '11h 05m',
        segments: [
          { from: 'San Francisco (SFO)', to: 'Lisbon (LIS)', depart: '15:20', arrive: '10:25+1', flight: 'AT 102', carrier: 'Atlantica', duration: '11h 05m', aircraft: 'A330neo' },
        ],
        layovers: [],
      },
      inbound: backStart
        ? {
            date: addDays(backStart, 6),
            totalDuration: '12h 20m',
            segments: [
              { from: 'Lisbon (LIS)', to: 'San Francisco (SFO)', depart: '12:10', arrive: '16:30', flight: 'AT 101', carrier: 'Atlantica', duration: '12h 20m', aircraft: 'A330neo' },
            ],
            layovers: [],
          }
        : null,
      outDayFares: outDays,
      backDayFares: backDays,
      booking: [],
    },
    {
      id: 'sjc-ewr-lis',
      fit: 82,
      price: 455,
      totalMinutes: 1100,
      carrier: 'Blue Meridian',
      fromAirport: 'SJC',
      toAirport: 'LIS',
      via: '1 stop · EWR',
      outDate: out.start,
      backDate: backStart,
      duration: '18h 20m',
      nights: nights(0, 0),
      badge: 'Lowest fare',
      warning: 'Long layover',
      why: 'Lowest fare we found, but you sit in Newark for 5h 10m on the way out.',
      reasons: ['Lowest fare in your window.', 'Long 5h 10m layover in Newark.'],
      scores: [
        { label: 'Price', value: 99 },
        { label: 'Travel time', value: 58 },
        { label: 'Connections', value: 61 },
        { label: 'Fits your weeks', value: 92 },
      ],
      outbound: { date: out.start, totalDuration: '18h 20m', segments: [], layovers: [] },
      inbound: null,
      outDayFares: outDays,
      backDayFares: backDays,
      booking: [],
    },
    {
      id: 'sfo-mad-lis',
      fit: 79,
      price: 534,
      totalMinutes: 1030,
      carrier: 'Northwind Air + Iberico',
      fromAirport: 'SFO',
      toAirport: 'LIS',
      via: '1 stop · MAD',
      outDate: addDays(out.start, 2),
      backDate: backStart && addDays(backStart, 4),
      duration: '17h 10m',
      nights: nights(2, 4),
      why: 'Solid backup if Tuesday sells out. Same airline alliance both ways, so bags are checked through.',
      reasons: ['Same alliance both ways.', 'Good backup option.'],
      scores: [
        { label: 'Price', value: 80 },
        { label: 'Travel time', value: 66 },
        { label: 'Connections', value: 84 },
        { label: 'Fits your weeks', value: 88 },
      ],
      outbound: { date: addDays(out.start, 2), totalDuration: '17h 10m', segments: [], layovers: [] },
      inbound: null,
      outDayFares: outDays,
      backDayFares: backDays,
      booking: [],
    },
    {
      id: 'oak-jfk-opo',
      fit: 76,
      price: 398,
      totalMinutes: 1010,
      carrier: 'Blue Meridian + rail',
      fromAirport: 'OAK',
      toAirport: 'OPO',
      via: '1 stop · JFK',
      outDate: addDays(out.start, 1),
      backDate: backStart && addDays(backStart, 1),
      duration: '16h 50m',
      nights: nights(1, 1),
      badge: 'Nearby arrival',
      warning: '+ 2h 50m train',
      why: 'Fly into Porto and take the train to Lisbon. Cheapest door-to-door if you don’t mind the extra leg.',
      reasons: ['Cheapest door-to-door.', 'Adds a 2h 50m train ride.'],
      scores: [
        { label: 'Price', value: 100 },
        { label: 'Travel time', value: 52 },
        { label: 'Connections', value: 70 },
        { label: 'Fits your weeks', value: 86 },
      ],
      outbound: { date: addDays(out.start, 1), totalDuration: '16h 50m', segments: [], layovers: [] },
      inbound: null,
      outDayFares: outDays,
      backDayFares: backDays,
      booking: [],
    },
  ];

  return {
    headline: "Leave on a Tuesday from Oakland. It's $123 cheaper than the nonstop and only 3½ hours longer.",
    summary: `I checked ${back ? 49 * 6 : 49} date pairs across ${q.from.airports.join(', ')} into ${q.to.name}${
      q.to.nearby?.length ? ` and ${q.to.nearby.map((n) => n.city).join(', ')}` : ''
    }. Five routes are worth your time.`,
    combosChecked: back ? 49 * 6 : 49,
    sample: true,
    weekFares: mockWeekFares(weeks),
    routes,
  };
}

/** The fixed search the signed-out demo shows: San Francisco to Lisbon, dates relative to today. */
export function demoQuery(weeks: Week[]): SearchQuery {
  return {
    from: POPULAR_CITIES.find((c) => c.code === 'SFO')!,
    to: POPULAR_CITIES.find((c) => c.code === 'LIS')!,
    departWeek: weeks[2],
    returnWeek: weeks[4],
    travelers: 1,
    cabin: 'economy',
    stay: 'range',
    priority: 'balance',
    depth: 'regular',
  };
}
