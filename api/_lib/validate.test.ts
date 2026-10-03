import { describe, expect, it } from 'vitest';
import { upcomingWeeks, formatIsoWeek } from '../../src/shared/weeks';
import { validateCurate } from './validate';

const weeks = upcomingWeeks(); // the full six-month window
const body = (over: object = {}) => ({
  from: 'SFO', to: 'LIS', out: formatIsoWeek(weeks[2]), back: formatIsoWeek(weeks[4]),
  stay: 'range', prio: 'balance', pax: 1, cabin: 'economy', ...over,
});

describe('validateCurate', () => {
  it('defaults to a regular search', () => {
    expect(validateCurate(body()).depth).toBe('regular');
  });

  it('accepts deep and rejects anything else', () => {
    expect(validateCurate(body({ depth: 'deep' })).depth).toBe('deep');
    expect(() => validateCurate(body({ depth: 'ultra' }))).toThrow();
  });

  it('never shares a cache entry between regular and deep', () => {
    const regular = JSON.stringify(validateCurate(body({ depth: 'regular' })).cacheKey);
    const deep = JSON.stringify(validateCurate(body({ depth: 'deep' })).cacheKey);
    expect(regular).not.toBe(deep);
    expect(regular).toBe(JSON.stringify(validateCurate(body()).cacheKey)); // default === regular
  });

  it('accepts any leave week in the next six months (26 weeks), and none after that', () => {
    expect(weeks).toHaveLength(26);
    expect(() => validateCurate(body({ out: formatIsoWeek(weeks[0]), back: formatIsoWeek(weeks[2]) }))).not.toThrow();
    expect(() => validateCurate(body({ out: formatIsoWeek(weeks[25]), back: null }))).not.toThrow(); // the very last week
    expect(() => validateCurate(body({ out: formatIsoWeek(weeks[14]), back: formatIsoWeek(weeks[24]) }))).not.toThrow(); // a Jan-Mar style trip
    const afterWindow = upcomingWeeks(27)[26];
    expect(() => validateCurate(body({ out: formatIsoWeek(afterWindow), back: null }))).toThrow(/6 months/);
  });

  it('allows a return up to 12 weeks after leaving, and no more', () => {
    expect(() => validateCurate(body({ out: formatIsoWeek(weeks[2]), back: formatIsoWeek(weeks[14]) }))).not.toThrow(); // 12 weeks
    expect(() => validateCurate(body({ out: formatIsoWeek(weeks[2]), back: formatIsoWeek(weeks[15]) }))).toThrow(/1 to 12 weeks/);
  });

  it('rejects weeks outside the window, a return before leaving, and same-city searches', () => {
    expect(() => validateCurate(body({ out: '2020-W10' }))).toThrow();
    expect(() => validateCurate(body({ back: formatIsoWeek(weeks[1]) }))).toThrow();
    expect(() => validateCurate(body({ to: 'SFO' }))).toThrow();
  });
});
