import { describe, expect, it } from 'vitest';
import type { City, SearchQuery } from '../shared/types';
import { parseIsoWeek, upcomingWeeks } from '../shared/weeks';
import { addLeg, editLeg, legQueries, legsOf, legsProblem, removeLeg, switchTrip, withLegs } from './legs';

const city = (code: string): City => ({ code, name: code, airports: [code] });
const w = (s: string) => parseIsoWeek(s)!;
const base: SearchQuery = {
  trip: 'round', extraLegs: [], from: city('SFO'), to: city('LIS'), departWeek: w('2026-W43'), returnWeek: w('2026-W45'),
  travelers: 2, cabin: 'premium', stay: 'range', priority: 'speed', depth: 'deep',
};
const multi: SearchQuery = {
  ...base, trip: 'multi', returnWeek: null,
  extraLegs: [{ from: city('LIS'), to: city('PAR'), week: w('2026-W45') }, { from: city('PAR'), to: city('SFO'), week: w('2026-W47') }],
};

describe('legQueries', () => {
  it('a round trip or one way is a single search', () => {
    expect(legQueries(base)).toEqual([base]);
  });

  it('a multi-city trip becomes one one-way search per flight, in order', () => {
    const legs = legQueries(multi);
    expect(legs.map((l) => `${l.from.code}-${l.to.code}-${l.departWeek.isoWeek}`)).toEqual(['SFO-LIS-43', 'LIS-PAR-45', 'PAR-SFO-47']);
    for (const l of legs) {
      expect(l).toMatchObject({ trip: 'oneway', returnWeek: null, extraLegs: [], depth: 'regular', stay: 'cheapest' });
      expect(l).toMatchObject({ travelers: 2, cabin: 'premium', priority: 'speed' }); // shared choices carry over
    }
  });
});

describe('legsProblem', () => {
  it('is fine for good trips', () => {
    expect(legsProblem(base)).toBeNull();
    expect(legsProblem(multi)).toBeNull();
  });
  it('catches same-city flights and flights that leave before the previous one', () => {
    expect(legsProblem({ ...base, to: city('SFO') })).toBe('Pick two different cities.');
    expect(legsProblem({ ...multi, extraLegs: [{ from: city('LIS'), to: city('LIS'), week: w('2026-W45') }] })).toBe('Flight 2: pick two different cities.');
    expect(legsProblem({ ...multi, extraLegs: [{ from: city('LIS'), to: city('PAR'), week: w('2026-W41') }] })).toBe("Flight 2 can't leave before flight 1.");
  });
  it('needs a second flight for multi-city', () => {
    expect(legsProblem({ ...multi, extraLegs: [] })).toBe('Add at least one more flight.');
  });
});

describe('editing a multi-city trip', () => {
  const weeks = upcomingWeeks(12, new Date('2026-10-01T12:00:00Z'));
  const trip: SearchQuery = { ...multi, departWeek: weeks[2], extraLegs: [{ from: city('LIS'), to: city('PAR'), week: weeks[4] }, { from: city('PAR'), to: city('SFO'), week: weeks[6] }] };

  it('legsOf lists every flight, and withLegs puts them back', () => {
    const legs = legsOf(trip);
    expect(legs.map((l) => `${l.from.code}-${l.to.code}`)).toEqual(['SFO-LIS', 'LIS-PAR', 'PAR-SFO']);
    expect(withLegs(legs)).toMatchObject({ from: { code: 'SFO' }, to: { code: 'LIS' }, extraLegs: [{ from: { code: 'LIS' } }, { from: { code: 'PAR' } }] });
  });

  it('changing where a flight ends moves the next flight, when they were connected', () => {
    const edited = editLeg(trip, 0, { to: city('ROM') });
    expect(edited.to.code).toBe('ROM');
    expect(edited.extraLegs[0].from.code).toBe('ROM'); // flight 2 started where flight 1 ended
    expect(edited.extraLegs[1].from.code).toBe('PAR'); // flight 3 is untouched
  });

  it('leaves an open-jaw flight (one that did not start where the last ended) alone', () => {
    const jaw: SearchQuery = { ...trip, extraLegs: [{ from: city('MAD'), to: city('PAR'), week: weeks[4] }, trip.extraLegs[1]] };
    expect(editLeg(jaw, 0, { to: city('ROM') }).extraLegs[0].from.code).toBe('MAD');
  });

  it('changing a week or a starting city does not move anything else', () => {
    const edited = editLeg(trip, 1, { week: weeks[5] });
    expect(edited.extraLegs[0].week).toBe(weeks[5]);
    expect(edited.extraLegs[1]).toEqual(trip.extraLegs[1]);
  });

  it('adds a flight that starts where the last ended and heads home, two weeks later, up to four', () => {
    const two: SearchQuery = { ...trip, extraLegs: [trip.extraLegs[0]] };
    const added = addLeg(two, weeks);
    expect(added.extraLegs).toHaveLength(2);
    expect(added.extraLegs[1]).toMatchObject({ from: { code: 'PAR' }, to: { code: 'SFO' } });
    expect(added.extraLegs[1].week.start).toBe(weeks[6].start);
    const four: SearchQuery = { ...trip, extraLegs: [...trip.extraLegs, { from: city('SFO'), to: city('LIS'), week: weeks[8] }] };
    expect(addLeg(four, weeks).extraLegs).toHaveLength(3); // no fifth flight
  });

  it('removes a flight but never goes below two', () => {
    expect(removeLeg(trip, 1).extraLegs.map((l) => l.from.code)).toEqual(['PAR']);
    const two: SearchQuery = { ...trip, extraLegs: [trip.extraLegs[0]] };
    expect(removeLeg(two, 1).extraLegs).toHaveLength(1);
  });
});

describe('switchTrip', () => {
  const weeks = upcomingWeeks(12, new Date('2026-10-01T12:00:00Z'));
  const round: SearchQuery = { ...base, departWeek: weeks[2], returnWeek: weeks[4] };

  it('round trip -> one way drops the return', () => {
    expect(switchTrip(round, weeks, 'oneway')).toEqual({ trip: 'oneway', returnWeek: null, extraLegs: [] });
  });

  it('one way -> round trip suggests a return two weeks later', () => {
    const one: SearchQuery = { ...round, trip: 'oneway', returnWeek: null };
    expect(switchTrip(one, weeks, 'round').returnWeek?.start).toBe(weeks[4].start);
  });

  it('one way -> round trip leaves the return empty when there is no later week', () => {
    const last: SearchQuery = { ...round, trip: 'oneway', returnWeek: null, departWeek: weeks[11] };
    expect(switchTrip(last, weeks, 'round').returnWeek).toBeNull();
  });

  it('-> multi-city starts with a second flight heading home, regular search only', () => {
    const patch = switchTrip(round, weeks, 'multi');
    expect(patch).toMatchObject({ trip: 'multi', returnWeek: null, depth: 'regular' });
    expect(patch.extraLegs).toHaveLength(1);
    expect(patch.extraLegs![0]).toMatchObject({ from: { code: 'LIS' }, to: { code: 'SFO' } });
  });

  it('keeps flights you already added when you come back to multi-city', () => {
    const had: SearchQuery = { ...round, trip: 'oneway', extraLegs: multi.extraLegs };
    expect(switchTrip(had, weeks, 'multi').extraLegs).toBe(multi.extraLegs);
  });

  it('does nothing when the trip type is unchanged', () => {
    expect(switchTrip(round, weeks, 'round')).toEqual({});
  });
});
