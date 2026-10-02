import { describe, expect, it } from 'vitest';
import { upcomingWeeks, formatIsoWeek } from '../../src/shared/weeks';
import { validateCurate } from './validate';

const weeks = upcomingWeeks(12);
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

  it('rejects weeks outside the window, a return before leaving, and same-city searches', () => {
    expect(() => validateCurate(body({ out: '2020-W10' }))).toThrow();
    expect(() => validateCurate(body({ back: formatIsoWeek(weeks[1]) }))).toThrow();
    expect(() => validateCurate(body({ to: 'SFO' }))).toThrow();
  });
});
