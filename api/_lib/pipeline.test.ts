import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseIsoWeek } from '../../src/shared/weeks';
import { runCuration } from './pipeline';
import type { NormalizedQuery } from './providers/types';

const q = (over: Partial<NormalizedQuery> = {}): NormalizedQuery => ({
  from: 'SFO', to: 'LIS', departWeek: parseIsoWeek('2026-W43')!, returnWeek: parseIsoWeek('2026-W45')!, travelers: 1, cabin: 'economy', ...over,
});

/** An Anthropic Messages API response carrying `body` as the model's text. */
const reply = (body: unknown) =>
  new Response(
    JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text: JSON.stringify(body) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
const SUMMARY_MODEL = 'claude-haiku-5-5';
const pickOf = (id: string, why = 'Fits.') => ({ candidateId: id, fit: 90, why, reasons: ['Fits.'], scores: { price: 90, travelTime: 80, connections: 70, weeksFit: 100 } });

describe('runCuration (simulated fares, Claude unavailable)', () => {
  beforeEach(() => {
    process.env.FARE_PROVIDER = 'simulated';
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('falls back to deterministic ranking with real, consistent data', async () => {
    const r = await runCuration(q(), { stay: 'range', priority: 'balance' });
    expect(r.aiFallback).toBe(true);
    expect(r.sample).toBe(true);
    expect(r.routes.length).toBeGreaterThan(0);
    expect(r.routes.filter((x) => x.tier === 'pick').length).toBeLessThanOrEqual(5);
    for (const route of r.routes) {
      expect(route.price).toBeGreaterThan(0);
      expect(route.booking.find((b) => b.id === 'google-flights')?.url).toContain('google.com/travel/flights');
      expect(route.outDate >= '2026-10-19' && route.outDate <= '2026-10-25').toBe(true);
      expect(route.inbound).not.toBeNull();
      expect(route.outDayFares.length).toBeGreaterThan(0);
      expect(Math.min(...route.outDayFares.map((d) => d.delta))).toBe(0);
    }
    expect(r.routes.filter((x) => x.badge === 'Best fit')).toHaveLength(1);
    const badges = r.routes.map((x) => x.badge).filter(Boolean);
    expect(new Set(badges).size).toBe(badges.length);
  });

  it('regular and deep searches send different models, prompts and numbers of candidates to Claude', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    delete process.env.CLAUDE_MODEL;
    delete process.env.CLAUDE_DEEP_MODEL;
    delete process.env.CLAUDE_SUMMARY_MODEL;
    const seen: { model: string; system: string; n: number; effort: string }[] = [];
    let summaries = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.model === SUMMARY_MODEL) {
        summaries++;
        return reply({ headline: 'Fine.', summary: 'Fine.' });
      }
      const cands = JSON.parse(body.messages[0].content).candidates as { id: string; priceUsd: number }[];
      seen.push({ model: body.model, system: body.system, n: cands.length, effort: body.output_config.effort });
      return reply({ picks: [pickOf(cands[0].id, `About $${cands[0].priceUsd}.`)] });
    }));
    await runCuration(q(), { stay: 'range', priority: 'balance', depth: 'regular' });
    await runCuration(q(), { stay: 'range', priority: 'balance', depth: 'deep' });
    vi.unstubAllGlobals();
    const [regular, deep] = seen;
    expect(regular).toMatchObject({ model: 'claude-sonnet-5-5', n: 10, effort: 'low' });
    expect(deep).toMatchObject({ model: 'claude-opus-5-5', n: 12, effort: 'medium' });
    expect(regular.system).toContain('regular search');
    expect(deep.system).toContain('Deep Search');
    expect(summaries).toBe(2); // Haiku writes the headline and summary for both
  });

  it('a search with no depth given is a regular one', async () => {
    const r = await runCuration(q(), { stay: 'range', priority: 'balance' });
    expect(r.routes.length).toBeGreaterThan(0);
  });

  it('handles one-way searches', async () => {
    const r = await runCuration(q({ returnWeek: null }), { stay: 'cheapest', priority: 'price' });
    expect(r.routes.length).toBeGreaterThan(0);
    expect(r.routes.every((x) => x.backDate === null && x.inbound === null && x.nights === 0)).toBe(true);
  });

  it('uses the AI answer when Claude responds validly, with the summary written by Haiku', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    const seen: { ids: string[] } = { ids: [] };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.model === SUMMARY_MODEL) {
        const picked = JSON.parse(body.messages[0].content).picks[0] as { priceUsd: number };
        return reply({ headline: `Top pick is $${picked.priceUsd}.`, summary: 'Checked many combinations.' });
      }
      const cands = JSON.parse(body.messages[0].content).candidates as { id: string; priceUsd: number }[];
      seen.ids = cands.map((c) => c.id);
      return reply({ picks: [{ ...pickOf(cands[0].id, `About $${cands[0].priceUsd} per adult.`), fit: 93 }] });
    }));
    const r = await runCuration(q(), { stay: 'range', priority: 'balance' });
    vi.unstubAllGlobals();
    expect(r.aiFallback).toBe(false);
    expect(r.routes.filter((x) => x.tier === 'pick')).toHaveLength(1); // the AI chose one
    expect(r.routes.length).toBeGreaterThan(1); // the rest follow as More options
    expect(r.routes[0].id).toBe(seen.ids[0]);
    expect(r.routes[0].fit).toBe(93);
    expect(r.headline).toContain('Top pick');
  });

  it("keeps Claude's picks and writes a plain summary when the summary step fails", async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.model === SUMMARY_MODEL) return new Response('{"error":{"message":"bad"}}', { status: 400 });
      return reply({ picks: [pickOf((JSON.parse(body.messages[0].content).candidates as { id: string }[])[0].id)] });
    }));
    const r = await runCuration(q(), { stay: 'range', priority: 'balance' });
    vi.unstubAllGlobals();
    expect(r.aiFallback).toBe(false);
    expect(r.routes.filter((x) => x.tier === 'pick')).toHaveLength(1);
    expect(r.summary).not.toContain('unavailable');
    expect(r.headline).toContain('Best match');
  });
});
