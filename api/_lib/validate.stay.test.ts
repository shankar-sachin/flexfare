import { describe, expect, it } from 'vitest';
import { formatIsoWeek, upcomingWeeks } from '../../src/shared/weeks';
import { validateCurate } from './validate';

const weeks = upcomingWeeks();
const body = (over: object = {}) => ({
  from: 'SFO', to: 'LIS', out: formatIsoWeek(weeks[2]), back: formatIsoWeek(weeks[3]),
  stay: 'range', prio: 'balance', pax: 1, cabin: 'economy', ...over,
});

describe('validateCurate: stay options', () => {
  it('accepts 1 night and 3-4 nights for weeks one apart', () => {
    expect(validateCurate(body({ stay: 'one-night' })).stay).toBe('one-night');
    expect(validateCurate(body({ stay: 'short' })).stay).toBe('short');
  });

  it('rejects a stay the weeks cannot give, with a message the form can show', () => {
    expect(() => validateCurate(body({ stay: 'one-night', back: formatIsoWeek(weeks[5]) }))).toThrow(/1 night/);
    expect(() => validateCurate(body({ stay: 'short', back: formatIsoWeek(weeks[8]) }))).toThrow(/3 to 4 nights/);
  });

  it('reads a custom stay from nights', () => {
    const v = validateCurate(body({ stay: 'custom', nights: '5-8', back: formatIsoWeek(weeks[4]) }));
    expect(v.customStay).toEqual({ min: 5, max: 8 });
    expect(validateCurate(body({ stay: 'custom', nights: '9', back: formatIsoWeek(weeks[4]) })).customStay).toEqual({ min: 9, max: 9 });
    expect(validateCurate(body()).customStay).toBeNull();
  });

  it('rejects a custom stay with missing, reversed or silly nights', () => {
    for (const nights of [undefined, '', '0', '9-5', '99', 'x']) expect(() => validateCurate(body({ stay: 'custom', nights })), String(nights)).toThrow(/nights/);
  });

  it('keeps different custom stays apart in the cache', () => {
    const a = JSON.stringify(validateCurate(body({ stay: 'custom', nights: '5-8' })).cacheKey);
    const b = JSON.stringify(validateCurate(body({ stay: 'custom', nights: '6-8' })).cacheKey);
    expect(a).not.toBe(b);
  });
});
