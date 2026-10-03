// Airlines we can send people to directly. Each has its official site; a few also have a search URL that
// opens with the trip filled in. Those were checked in a real browser on 2026-10-02 (see booking.test.ts for the
// exact formats). Anything else opens the airline's own site and we show the trip details to enter.
export interface TripArgs {
  from: string; // airport code
  to: string;
  outDate: string; // YYYY-MM-DD
  backDate: string | null;
  travelers: number;
  cabin: 'economy' | 'premium' | 'business';
}

export interface Airline {
  name: string;
  home: string;
  /** Opens the airline's results (or booking form) for this trip. Absent = no verified format. */
  deep?: (t: TripArgs) => string;
  /** True when the deep link only fills the form, so the traveler still clicks "Find flights". */
  needsClick?: boolean;
}

const q = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();

const DEEP: Record<string, Pick<Airline, 'deep' | 'needsClick'>> = {
  // Alaska: results page. Verified: SFO-SEA round trip showed the right dates.
  AS: {
    deep: (t) =>
      `https://www.alaskaair.com/search/results?${q({ A: t.travelers, C: 0, L: 0, O: t.from, D: t.to, OD: t.outDate, DD: t.backDate ?? undefined, RT: t.backDate ? 'true' : 'false', FT: 'false', FREF: 1 })}`,
  },
  // United: tt=0 is round trip, tt=1 is one way (verified; the other way round opens a one-way search).
  UA: {
    deep: (t) =>
      `https://www.united.com/en/us/fsr/choose-flights?${q({ f: t.from, t: t.to, d: t.outDate, r: t.backDate ?? undefined, sc: t.cabin === 'economy' ? 7 : undefined, px: t.travelers, taxng: 1, tt: t.backDate ? 0 : 1, clm: 7, st: 'bestmatches', tqp: t.backDate ? 'R' : 'O' })}`,
  },
  // American: starts a booking session with the slices (verified: redirected to its flight choice page).
  AA: {
    deep: (t) => {
      const slice = (orig: string, dest: string, date: string) => ({ orig, origNearby: false, dest, destNearby: false, date });
      const slices = [slice(t.from, t.to, t.outDate), ...(t.backDate ? [slice(t.to, t.from, t.backDate)] : [])];
      return `https://www.aa.com/booking/search?${q({ locale: 'en_US', pax: t.travelers, adult: t.travelers, child: 0, type: t.backDate ? 'RoundTrip' : 'OneWay', searchType: 'Revenue', cabin: '', carriers: 'ALL', slices: JSON.stringify(slices) })}`;
    },
  },
  // JetBlue: results page (verified).
  B6: {
    deep: (t) =>
      `https://www.jetblue.com/booking/flights?${q({ from: t.from, to: t.to, depart: t.outDate, return: t.backDate ?? undefined, isMultiCity: 'false', noOfRoute: 1, lang: 'en', adults: t.travelers, children: 0, infants: 0, sharedMarket: 'false', roundTripFaresFlag: 'false', usePoints: 'false' })}`,
  },
  // Delta: fills the booking form (verified); the traveler clicks "Find Flights".
  DL: {
    needsClick: true,
    deep: (t) =>
      `https://www.delta.com/flight-search/book-a-flight?${q({ tripType: t.backDate ? 'ROUND_TRIP' : 'ONE_WAY', originCity: t.from, destinationCity: t.to, departureDate: t.outDate, returnDate: t.backDate ?? undefined, paxCount: t.travelers })}`,
  },
};

const LIST: [code: string, name: string, home: string][] = [
  ['UA', 'United Airlines', 'https://www.united.com'], ['DL', 'Delta Air Lines', 'https://www.delta.com'],
  ['AA', 'American Airlines', 'https://www.aa.com'], ['AS', 'Alaska Airlines', 'https://www.alaskaair.com'],
  ['B6', 'JetBlue', 'https://www.jetblue.com'], ['WN', 'Southwest Airlines', 'https://www.southwest.com'],
  ['F9', 'Frontier Airlines', 'https://www.flyfrontier.com'], ['NK', 'Spirit Airlines', 'https://www.spirit.com'],
  ['HA', 'Hawaiian Airlines', 'https://www.hawaiianairlines.com'], ['AC', 'Air Canada', 'https://www.aircanada.com'],
  ['WS', 'WestJet', 'https://www.westjet.com'], ['LH', 'Lufthansa', 'https://www.lufthansa.com'],
  ['LX', 'SWISS', 'https://www.swiss.com'], ['OS', 'Austrian Airlines', 'https://www.austrian.com'],
  ['AF', 'Air France', 'https://www.airfrance.com'], ['KL', 'KLM', 'https://www.klm.com'],
  ['IB', 'Iberia', 'https://www.iberia.com'], ['TP', 'TAP Air Portugal', 'https://www.flytap.com'],
  ['BA', 'British Airways', 'https://www.britishairways.com'], ['VS', 'Virgin Atlantic', 'https://www.virginatlantic.com'],
  ['EI', 'Aer Lingus', 'https://www.aerlingus.com'], ['AY', 'Finnair', 'https://www.finnair.com'],
  ['SK', 'SAS', 'https://www.flysas.com'], ['DY', 'Norwegian', 'https://www.norwegian.com'],
  ['FR', 'Ryanair', 'https://www.ryanair.com'], ['U2', 'easyJet', 'https://www.easyjet.com'],
  ['VY', 'Vueling', 'https://www.vueling.com'], ['TK', 'Turkish Airlines', 'https://www.turkishairlines.com'],
  ['EK', 'Emirates', 'https://www.emirates.com'], ['QR', 'Qatar Airways', 'https://www.qatarairways.com'],
  ['EY', 'Etihad Airways', 'https://www.etihad.com'], ['SQ', 'Singapore Airlines', 'https://www.singaporeair.com'],
  ['CX', 'Cathay Pacific', 'https://www.cathaypacific.com'], ['NH', 'ANA', 'https://www.ana.co.jp'],
  ['JL', 'Japan Airlines', 'https://www.jal.co.jp'], ['KE', 'Korean Air', 'https://www.koreanair.com'],
  ['QF', 'Qantas', 'https://www.qantas.com'], ['NZ', 'Air New Zealand', 'https://www.airnewzealand.com'],
  ['LA', 'LATAM Airlines', 'https://www.latamairlines.com'], ['AV', 'Avianca', 'https://www.avianca.com'],
  ['AM', 'Aeroméxico', 'https://www.aeromexico.com'], ['CM', 'Copa Airlines', 'https://www.copaair.com'],
  ['ET', 'Ethiopian Airlines', 'https://www.ethiopianairlines.com'], ['AZ', 'ITA Airways', 'https://www.ita-airways.com'],
  ['SN', 'Brussels Airlines', 'https://www.brusselsairlines.com'], ['LO', 'LOT Polish Airlines', 'https://www.lot.com'],
  ['TG', 'Thai Airways', 'https://www.thaiairways.com'], ['BR', 'EVA Air', 'https://www.evaair.com'],
  ['CI', 'China Airlines', 'https://www.china-airlines.com'], ['AI', 'Air India', 'https://www.airindia.com'],
];

export const AIRLINES: Record<string, Airline> = Object.fromEntries(LIST.map(([code, name, home]) => [code, { name, home, ...DEEP[code] }]));

/** "UA 238" -> "UA". Returns null for anything that isn't a two-character airline code. */
export function carrierCode(flightNumber: string | undefined): string | null {
  const code = flightNumber?.trim().split(/\s+/)[0]?.toUpperCase();
  return code && /^[A-Z0-9]{2}$/.test(code) ? code : null;
}
