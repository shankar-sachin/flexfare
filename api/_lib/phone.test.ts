import { describe, expect, it } from 'vitest';
import { hashPhone, isFakeLooking, normalizePhone } from './phone';

describe('phone', () => {
  it('normalises to E.164 and rejects junk', () => {
    expect(normalizePhone('+1 (415) 867-5309')).toBe('+14158675309');
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalizePhone('4158675309')).toBeNull(); // no country code
    expect(normalizePhone('+0123456789')).toBeNull();
    expect(normalizePhone('+12')).toBeNull();
  });

  it('flags obviously fake numbers', () => {
    expect(isFakeLooking('+11111111111')).toBe(true);
    expect(isFakeLooking('+11234567890')).toBe(true);
    expect(isFakeLooking('+14155550123')).toBe(true);
    expect(isFakeLooking('+12121212121')).toBe(true);
    expect(isFakeLooking('+14158675309')).toBe(false);
  });

  it('hashes consistently and never contains the number', () => {
    const a = hashPhone('+14158675309', 's1');
    expect(a).toBe(hashPhone('+14158675309', 's1'));
    expect(a).not.toBe(hashPhone('+14158675309', 's2'));
    expect(a).not.toContain('4158675309');
  });
});
