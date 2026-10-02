import { describe, expect, it } from 'vitest';
import { CODE_TTL_MS, MAX_ATTEMPTS, MAX_SENDS_PER_HOUR, RESEND_MS, checkCode, hashCode, makeCode, planSend, type CodeDoc } from './emailCodeLogic';

const S = 'secret';
const T0 = 1_000_000_000_000;

describe('makeCode', () => {
  it('is always six digits', () => {
    for (let i = 0; i < 500; i++) expect(makeCode()).toMatch(/^[1-9]\d{5}$/);
  });
});

describe('planSend', () => {
  it('sends a first code and stores only a hash', () => {
    const p = planSend(undefined, 'u1', S, T0, () => '123456');
    if (p.action !== 'send') throw new Error('expected send');
    expect(p.code).toBe('123456');
    expect(p.doc.hash).toBe(hashCode('u1', '123456', S));
    expect(JSON.stringify(p.doc)).not.toContain('123456');
    expect(p.doc.expiresAt).toBe(T0 + CODE_TTL_MS);
    expect(p.doc.sendsThisHour).toBe(1);
  });

  it('makes people wait a minute between sends', () => {
    const first = planSend(undefined, 'u1', S, T0, () => '111111');
    if (first.action !== 'send') throw new Error('expected send');
    const again = planSend(first.doc, 'u1', S, T0 + 20_000);
    expect(again).toEqual({ action: 'wait', retryAfter: 40 });
    expect(planSend(first.doc, 'u1', S, T0 + RESEND_MS).action).toBe('send');
  });

  it('caps sends per hour, then lets them start over', () => {
    let doc: CodeDoc | undefined;
    let now = T0;
    for (let i = 0; i < MAX_SENDS_PER_HOUR; i++) {
      const p = planSend(doc, 'u1', S, now);
      if (p.action !== 'send') throw new Error(`send ${i} should be allowed`);
      doc = p.doc;
      now += RESEND_MS;
    }
    expect(planSend(doc, 'u1', S, now).action).toBe('limit');
    expect(planSend(doc, 'u1', S, T0 + 3_600_001).action).toBe('send');
  });
});

describe('checkCode', () => {
  const sent = (code = '654321') => {
    const p = planSend(undefined, 'u1', S, T0, () => code);
    if (p.action !== 'send') throw new Error('expected send');
    return p.doc;
  };

  it('accepts the right code only for the right user', () => {
    expect(checkCode(sent(), 'u1', '654321', S, T0 + 1000)).toBe('ok');
    expect(checkCode(sent(), 'u1', '654322', S, T0 + 1000)).toBe('wrong');
    expect(checkCode(sent(), 'someone-else', '654321', S, T0 + 1000)).toBe('wrong');
  });

  it('rejects expired, missing and locked-out codes', () => {
    expect(checkCode(sent(), 'u1', '654321', S, T0 + CODE_TTL_MS + 1)).toBe('expired');
    expect(checkCode(undefined, 'u1', '654321', S, T0)).toBe('expired');
    expect(checkCode({ ...sent(), attempts: MAX_ATTEMPTS }, 'u1', '654321', S, T0 + 1000)).toBe('locked');
  });
});
