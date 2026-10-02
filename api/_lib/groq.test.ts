import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askGroq, validateOutput } from './groq';
import { fallbackPicks } from './pipeline';
import type { FareCandidate } from './providers/types';
import { scoreCandidates } from './scoring';

const cand = (id: string, price: number, o: Partial<FareCandidate> = {}): FareCandidate => ({
  id, originAirport: 'OAK', destAirport: 'LIS', isNearby: false, nearbyTransferMinutes: 0, outDate: '2026-10-20', backDate: '2026-11-03',
  price, airline: 'Atlantica', stopsOut: 1, stopsBack: 1, minutesOut: 800, minutesBack: 800, foundAt: '2026-10-01T00:00:00Z', ...o,
});
const scored = scoreCandidates(
  [cand('a', 489), cand('b', 612, { stopsOut: 0, stopsBack: 0, minutesOut: 665, minutesBack: 665, outDate: '2026-10-22' })],
  { priority: 'balance', stay: 'range', hasReturn: true },
);
const pick = (id: string, extra: object = {}) => ({
  candidateId: id, fit: 90, badge: null, warning: null, why: 'Fine.', reasons: ['One reason.'],
  scores: { price: 90, travelTime: 80, connections: 70, weeksFit: 100 }, ...extra,
});
const output = (picks: object[], extra: object = {}) => ({ headline: 'Headline', summary: 'Summary', picks, ...extra });

describe('validateOutput', () => {
  it('accepts a valid answer and clamps scores', () => {
    const out = validateOutput(output([pick('a', { fit: 100 })]), scored);
    expect(out.picks[0].candidateId).toBe('a');
  });

  it('rejects unknown ids, duplicate ids and reused badges', () => {
    expect(() => validateOutput(output([pick('zzz')]), scored)).toThrow(/Unknown candidateId/);
    expect(() => validateOutput(output([pick('a'), pick('a')]), scored)).toThrow(/twice/);
    expect(() => validateOutput(output([pick('a', { badge: 'Best fit' }), pick('b', { badge: 'Best fit' })]), scored)).toThrow(/more than once/);
  });

  it('rejects invented dollar amounts but allows real ones', () => {
    expect(() => validateOutput(output([pick('a', { why: 'Only $321 for this.' })]), scored)).toThrow(/does not appear/);
    expect(() => validateOutput(output([pick('a', { why: 'Costs $489, which is $123 under the nonstop.' })]), scored)).not.toThrow();
  });

  it('rejects malformed output', () => {
    expect(() => validateOutput({ headline: 'x' }, scored)).toThrow(/schema/);
  });
});

describe('askGroq fallback', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns null (so the deterministic fallback is used) when every attempt fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await askGroq('sys', 'user', scored)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('retries once with the validation error, then succeeds', async () => {
    const reply = (body: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
    const fn = vi.fn()
      .mockResolvedValueOnce(reply(output([pick('missing')])))
      .mockResolvedValueOnce(reply(output([pick('a')])));
    vi.stubGlobal('fetch', fn);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = await askGroq('sys', 'user', scored);
    expect(out?.picks[0].candidateId).toBe('a');
    expect(String(JSON.parse(fn.mock.calls[1][1].body).messages[1].content)).toContain('rejected');
  });
});

describe('fallbackPicks', () => {
  it('uses real numbers and unique badges', () => {
    const picks = fallbackPicks(scored);
    expect(picks.length).toBe(2);
    const badges = picks.map((p) => p.badge).filter(Boolean);
    expect(new Set(badges).size).toBe(badges.length);
    expect(picks.every((p) => p.reasons.length >= 2)).toBe(true);
  });
});
