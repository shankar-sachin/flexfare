import { describe, expect, it } from 'vitest';
import { AIRLINES, carrierCode } from './airlines';
import { buildBookingOptions, expediaUrl, googleFlightsUrl, kayakUrl, skyscannerUrl, tripSummary, type TripArgs } from './booking';

const rt: TripArgs = { from: 'SFO', to: 'JFK', outDate: '2026-11-10', backDate: '2026-11-17', travelers: 1, cabin: 'economy' };
const ow: TripArgs = { ...rt, backDate: null };

// These formats were opened in a real browser on 2026-10-02 and showed the trip filled in.
describe('airline deep links (verified formats)', () => {
  it('Alaska', () => {
    expect(AIRLINES.AS.deep!(rt)).toBe('https://www.alaskaair.com/search/results?A=1&C=0&L=0&O=SFO&D=JFK&OD=2026-11-10&DD=2026-11-17&RT=true&FT=false&FREF=1');
    expect(AIRLINES.AS.deep!(ow)).toContain('RT=false');
    expect(AIRLINES.AS.deep!(ow)).not.toContain('DD=');
  });

  it('United: tt=0 is round trip, tt=1 is one way', () => {
    expect(AIRLINES.UA.deep!(rt)).toContain('tt=0');
    expect(AIRLINES.UA.deep!(rt)).toContain('f=SFO&t=JFK&d=2026-11-10&r=2026-11-17&sc=7&px=1');
    expect(AIRLINES.UA.deep!(ow)).toContain('tt=1');
    expect(AIRLINES.UA.deep!(ow)).not.toContain('r=');
    expect(AIRLINES.UA.deep!({ ...rt, cabin: 'business' })).not.toContain('sc='); // only economy's code is known
  });

  it('American: a JSON list of slices, with the return as a second slice', () => {
    const url = new URL(AIRLINES.AA.deep!(rt));
    expect(url.searchParams.get('type')).toBe('RoundTrip');
    expect(JSON.parse(url.searchParams.get('slices')!)).toEqual([
      { orig: 'SFO', origNearby: false, dest: 'JFK', destNearby: false, date: '2026-11-10' },
      { orig: 'JFK', origNearby: false, dest: 'SFO', destNearby: false, date: '2026-11-17' },
    ]);
    const one = new URL(AIRLINES.AA.deep!(ow));
    expect(one.searchParams.get('type')).toBe('OneWay');
    expect(JSON.parse(one.searchParams.get('slices')!)).toHaveLength(1);
  });

  it('JetBlue', () => {
    const u = new URL(AIRLINES.B6.deep!({ ...rt, travelers: 2 }));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ from: 'SFO', to: 'JFK', depart: '2026-11-10', return: '2026-11-17', adults: '2' });
    expect(new URL(AIRLINES.B6.deep!(ow)).searchParams.has('return')).toBe(false);
  });

  it('Delta fills the form but needs a click', () => {
    const u = new URL(AIRLINES.DL.deep!(rt));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ tripType: 'ROUND_TRIP', originCity: 'SFO', destinationCity: 'JFK', departureDate: '2026-11-10', returnDate: '2026-11-17', paxCount: '1' });
    expect(new URL(AIRLINES.DL.deep!(ow)).searchParams.get('tripType')).toBe('ONE_WAY');
    expect(AIRLINES.DL.needsClick).toBe(true);
  });

  it('every airline has a name and an https website', () => {
    for (const [code, a] of Object.entries(AIRLINES)) {
      expect(code).toMatch(/^[A-Z0-9]{2}$/);
      expect(a.name.length).toBeGreaterThan(2);
      expect(a.home).toMatch(/^https:\/\/www\./);
    }
    expect(Object.keys(AIRLINES).length).toBeGreaterThan(40);
  });
});

describe('carrierCode', () => {
  it('reads the airline from a flight number', () => {
    expect(carrierCode('UA 238')).toBe('UA');
    expect(carrierCode('b6 416')).toBe('B6');
    expect(carrierCode('—')).toBeNull();
    expect(carrierCode('')).toBeNull();
    expect(carrierCode(undefined)).toBeNull();
    expect(carrierCode('LUFTHANSA 12')).toBeNull();
  });
});

describe('search sites (verified formats)', () => {
  it('Google Flights, round trip and one way, with cabin', () => {
    expect(decodeURIComponent(googleFlightsUrl(rt))).toContain('Flights from SFO to JFK on 2026-11-10 through 2026-11-17');
    expect(decodeURIComponent(googleFlightsUrl(ow))).toMatch(/on 2026-11-10$/);
    expect(decodeURIComponent(googleFlightsUrl({ ...rt, cabin: 'business' }))).toContain('business class');
  });

  it('Skyscanner', () => {
    expect(skyscannerUrl(rt)).toBe('https://www.skyscanner.com/transport/flights/sfo/jfk/261110/261117/?adultsv2=1&cabinclass=economy&rtn=1');
    expect(skyscannerUrl({ ...ow, cabin: 'premium', travelers: 2 })).toBe('https://www.skyscanner.com/transport/flights/sfo/jfk/261110/?adultsv2=2&cabinclass=premiumeconomy&rtn=0');
  });

  it('Expedia', () => {
    const u = expediaUrl(rt);
    expect(u).toContain('trip=roundtrip');
    expect(u).toContain('leg1=from:SFO,to:JFK,departure:11/10/2026TANYT');
    expect(u).toContain('leg2=from:JFK,to:SFO,departure:11/17/2026TANYT');
    expect(u).toContain('passengers=adults:1');
    expect(expediaUrl(ow)).toContain('trip=oneway');
    expect(expediaUrl(ow)).not.toContain('leg2');
    expect(expediaUrl({ ...rt, cabin: 'premium' })).toContain('cabinclass:premium_economy');
  });

  it('Kayak', () => {
    expect(kayakUrl(rt)).toBe('https://www.kayak.com/flights/SFO-JFK/2026-11-10/2026-11-17/1adults?sort=bestflight_a');
    expect(kayakUrl({ ...ow, travelers: 3 })).toBe('https://www.kayak.com/flights/SFO-JFK/2026-11-10/3adults?sort=bestflight_a');
  });
});

describe('buildBookingOptions', () => {
  it('puts the first airline first and recommended, then the search sites', () => {
    const o = buildBookingOptions({ ...rt, carriers: [{ code: 'UA', name: 'United' }, { code: 'LH', name: 'Lufthansa' }] });
    expect(o.map((x) => x.id)).toEqual(['airline-UA', 'airline-LH', 'google-flights', 'skyscanner', 'expedia', 'kayak']);
    expect(o.filter((x) => x.recommended).map((x) => x.id)).toEqual(['airline-UA']);
    expect(o[0].note).toBe('Opens United Airlines with your trip filled in.');
  });

  it("says plainly when an airline can't be pre-filled, and shows the trip to enter", () => {
    const [tap] = buildBookingOptions({ ...rt, from: 'SFO', to: 'LIS', carriers: [{ code: 'TP', name: 'TAP Air Portugal' }] });
    expect(tap).toMatchObject({ id: 'airline-TP', url: 'https://www.flytap.com', prefilled: false, recommended: true });
    expect(tap.note).toContain("can't be pre-filled");
    expect(tap.note).toContain('SFO to LIS · Tue Nov 10, back Tue Nov 17 · 1 adult · Economy');
  });

  it('tells you to click Find Flights where the airline only fills the form', () => {
    const [dl] = buildBookingOptions({ ...rt, carriers: [{ code: 'DL', name: 'Delta' }] });
    expect(dl.note).toContain('Click Find Flights');
  });

  it('shows at most two airlines, skips repeats and unknown airline codes', () => {
    const o = buildBookingOptions({ ...rt, carriers: [{ code: 'ZZ', name: 'Mystery Air' }, { code: 'UA', name: 'United' }, { code: 'UA', name: 'United' }, { code: 'LH', name: 'L' }, { code: 'AF', name: 'A' }] });
    expect(o.filter((x) => x.kind === 'airline').map((x) => x.id)).toEqual(['airline-UA', 'airline-LH']);
    expect(o.find((x) => x.id === 'airline-UA')!.recommended).toBe(true);
  });

  it('still offers the search sites when no airline is known, and adds Aviasales when given a fare link', () => {
    const o = buildBookingOptions({ ...rt, aviasalesUrl: 'https://www.aviasales.com/search/X?marker=1' });
    expect(o.map((x) => x.id)).toEqual(['google-flights', 'skyscanner', 'expedia', 'kayak', 'aviasales']);
    expect(o.some((x) => x.recommended)).toBe(false);
  });

  it('describes the trip in words', () => {
    expect(tripSummary({ ...ow, travelers: 2, cabin: 'business' })).toBe('SFO to JFK · Tue Nov 10 · 2 adults · Business');
  });
});
