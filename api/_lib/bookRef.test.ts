import { describe, expect, it } from 'vitest';
import { signBookRef, verifyBookRef } from './bookRef';

const ref = { kind: 'departure' as const, token: 'tok_abcdefghij', dep: 'SEA', arr: 'HND', out: '2026-12-30', back: '2027-01-06', cabin: 'economy' as const };

describe('book reference signing', () => {
  it('accepts what we signed, as it travels through JSON', () => {
    const signed = signBookRef(ref);
    expect(signed.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyBookRef(JSON.parse(JSON.stringify(signed)))).toEqual(signed);
    expect(verifyBookRef(JSON.parse(JSON.stringify(signBookRef({ ...ref, kind: 'booking', back: null }))))).not.toBeNull();
  });

  it('rejects any change to the token, airports, dates, cabin or kind', () => {
    const signed = signBookRef(ref);
    for (const change of [{ token: 'tok_zzzzzzzzzz' }, { dep: 'SFO' }, { arr: 'NRT' }, { out: '2026-12-31' }, { back: null }, { cabin: 'business' }, { kind: 'booking' }]) {
      expect(verifyBookRef({ ...signed, ...change }), JSON.stringify(change)).toBeNull();
    }
  });

  it('rejects a missing, short or foreign signature and malformed fields', () => {
    const signed = signBookRef(ref);
    expect(verifyBookRef({ ...signed, sig: undefined })).toBeNull();
    expect(verifyBookRef({ ...signed, sig: 'abc' })).toBeNull();
    expect(verifyBookRef({ ...signed, sig: 'f'.repeat(64) })).toBeNull();
    expect(verifyBookRef({ ...signed, dep: 'sea' })).toBeNull();
    expect(verifyBookRef(null)).toBeNull();
    expect(verifyBookRef('x')).toBeNull();
  });

  it('is tied to the secret: a different secret cannot verify it', () => {
    const keep = process.env.BOOKING_SECRET;
    process.env.BOOKING_SECRET = 'one';
    const signed = signBookRef(ref);
    process.env.BOOKING_SECRET = 'two';
    expect(verifyBookRef(signed)).toBeNull();
    if (keep === undefined) delete process.env.BOOKING_SECRET;
    else process.env.BOOKING_SECRET = keep;
  });
});
