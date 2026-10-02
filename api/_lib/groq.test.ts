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

describe('validateOutput: differences between your own picks', () => {
  const three = scoreCandidates(
    [cand('x', 400), cand('y', 450, { outDate: '2026-10-21' }), cand('z', 480, { outDate: '2026-10-22' })],
    { priority: 'balance', stay: 'range', hasReturn: true },
  );
  it('allows the exact difference between two picked prices, but not other numbers', () => {
    const picks = (why: string) => output([pick('y', { why }), pick('z')]);
    expect(() => validateOutput(picks('$30 less than the other pick.'), three)).not.toThrow(); // 480 - 450
    expect(() => validateOutput(picks('$31 less than the other pick.'), three)).toThrow(/does not appear/);
  });
});

describe('askGroq call policy (max 2 answers, 3 requests)', () => {
  const reply = (body: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
  const models = { primary: 'primary-model', fallback: 'fallback-model' };
  const used = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).model);

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives up after ONE call when Groq rejects the request outright (400)', async () => {
    const f = vi.fn(async () => new Response('{"error":{"message":"bad schema"}}', { status: 400 }));
    vi.stubGlobal('fetch', f);
    expect(await askGroq('sys', 'user', scored, models)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('also stops straight away on a bad key (401)', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 401 }));
    vi.stubGlobal('fetch', f);
    expect(await askGroq('sys', 'user', scored, models)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('tries the fallback model once when the primary is down, rate limited or missing', async () => {
    for (const status of [429, 500, 503, 404]) {
      const f = vi.fn(async () => new Response('x', { status }));
      vi.stubGlobal('fetch', f);
      expect(await askGroq('sys', 'user', scored, models)).toBeNull();
      expect(used(f)).toEqual(['primary-model', 'fallback-model']);
    }
  });

  it('uses the fallback model result when the primary is down', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('x', { status: 503 })).mockResolvedValueOnce(reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    expect((await askGroq('sys', 'user', scored, models))?.picks[0].candidateId).toBe('a');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries the same model once, with the reason, when the answer breaks the rules', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply(output([pick('missing')]))).mockResolvedValueOnce(reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    expect((await askGroq('sys', 'user', scored, models))?.picks[0].candidateId).toBe('a');
    expect(used(f)).toEqual(['primary-model', 'primary-model']);
    expect(String(JSON.parse((f.mock.calls[1][1] as RequestInit).body as string).messages[1].content)).toContain('rejected');
  });

  it("treats Groq's 400 json_validate_failed (the model's own bad JSON) as a bad answer: one retry with the reason", async () => {
    const bad = () =>
      new Response(JSON.stringify({ error: { message: "Generated JSON does not match the expected schema. Error: jsonschema: '/picks/0/scores/weeksFit' expected number, but got null", code: 'json_validate_failed' } }), { status: 400 });
    const f = vi.fn().mockResolvedValueOnce(bad()).mockResolvedValueOnce(reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    expect((await askGroq('sys', 'user', scored, models))?.picks[0].candidateId).toBe('a');
    expect(used(f)).toEqual(['primary-model', 'primary-model']);
    const retryPrompt = String(JSON.parse((f.mock.calls[1][1] as RequestInit).body as string).messages[1].content);
    expect(retryPrompt).toContain('weeksFit');
    expect(retryPrompt).toContain('never null');
  });

  it('stops after two bad answers instead of trying a third time', async () => {
    const f = vi.fn(async () => reply(output([pick('missing')])));
    vi.stubGlobal('fetch', f);
    expect(await askGroq('sys', 'user', scored, models)).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('after a bad answer, a rate-limited retry costs nothing and the fallback model gets the turn', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reply(output([pick('missing')])))
      .mockResolvedValueOnce(new Response('{"error":{"code":"rate_limit_exceeded"}}', { status: 429 }))
      .mockResolvedValueOnce(reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    expect((await askGroq('sys', 'user', scored, models))?.picks[0].candidateId).toBe('a');
    expect(used(f)).toEqual(['primary-model', 'primary-model', 'fallback-model']);
  });

  it('treats cut-off (invalid) JSON as a bad answer, not a crash', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"headline": "cut off' }, finish_reason: 'length' }] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await askGroq('sys', 'user', scored, models)).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('asks for strict structured output with room to think', async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    await askGroq('sys', 'user', scored, { primary: 'openai/gpt-oss-120b', fallback: 'openai/gpt-oss-20b' });
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(2000); // room to think, but small enough for Groq's free tier
    expect(body.reasoning_effort).toBe('low');
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
