import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from './http';
import type { LiveSearch, LiveSearchReply, LiveSearchRequest, SearchResult } from './providers/types';
import { scoutFares } from './searchAgent';

const plan = { primary: 'small', fallback: 'big', summary: 'tiny', effort: 'low' as const, maxTokens: 2500 };
const input = {
  from: 'SFO', to: 'LIS', departWeek: { start: '2026-10-19', end: '2026-10-25' }, returnWeek: { start: '2026-11-02', end: '2026-11-08' },
  stay: 'about-two-weeks' as const, priority: 'balance' as const, budget: 3, deep: false, nearby: [],
};

const useTool = (id: string, args: object) => ({ type: 'tool_use', id, name: 'search_flights', input: args });
const turn = (content: object[], stop_reason = 'tool_use') => ({ content, stop_reason });
const DONE = turn([{ type: 'text', text: 'done' }], 'end_turn');

function liveSearch(reply: (r: LiveSearchRequest) => LiveSearchReply | Promise<LiveSearchReply>, found = 1): LiveSearch & { calls: LiveSearchRequest[] } {
  const calls: LiveSearchRequest[] = [];
  return {
    budget: 3,
    calls,
    searchesStarted: () => calls.length,
    run: async (r) => {
      calls.push(r);
      return reply(r);
    },
    result: async (): Promise<SearchResult> => ({ candidates: Array(found).fill(null), grid: [], pairsChecked: calls.length, sample: false }),
  };
}
const ok: LiveSearchReply = { found: 1, cheapestNonstopUsd: null, options: [{ priceUsd: 900, stops: 1, duration: '14h 00m', airlines: 'United' }] };

function fakeClient(...turns: object[]) {
  const create = vi.fn();
  for (const t of turns) create.mockImplementationOnce(async () => t);
  return { create, deps: { client: { messages: { create } } as unknown as Anthropic } };
}
const userMessages = (create: ReturnType<typeof vi.fn>, n: number) => (create.mock.calls[n][0] as { messages: { role: string; content: any }[] }).messages;

describe('scoutFares', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('runs the searches Claude asks for and sends every result back in ONE user message', async () => {
    const live = liveSearch(() => ok);
    const c = fakeClient(
      turn([useTool('t1', { out_date: '2026-10-21', back_date: '2026-11-04', destination: 'main' }), useTool('t2', { out_date: '2026-10-24', back_date: '2026-11-07', destination: 'main' })]),
      DONE,
    );
    await scoutFares(live, input, plan, c.deps);
    expect(live.calls).toEqual([
      { outDate: '2026-10-21', backDate: '2026-11-04', destination: 'main' },
      { outDate: '2026-10-24', backDate: '2026-11-07', destination: 'main' },
    ]);
    expect(c.create).toHaveBeenCalledTimes(2);
    // the mock holds a reference to the array the loop keeps extending, so look only at what the 2nd call was sent
    const second = userMessages(c.create, 1).slice(0, 3);
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second[2].content.map((b: { tool_use_id: string }) => b.tool_use_id)).toEqual(['t1', 't2']);
    expect(JSON.parse(second[2].content[0].content).options[0].priceUsd).toBe(900);
  });

  it('offers only the search tool, gives the budget and the windows, and sends no sampling parameters', async () => {
    const c = fakeClient(DONE);
    await scoutFares(liveSearch(() => ok), input, plan, c.deps);
    const body = c.create.mock.calls[0][0] as Record<string, any>;
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['search_flights']);
    expect(body.model).toBe('small');
    expect(body.system).toContain('at most 3 calls');
    expect(body.system).toContain('2026-10-19 to 2026-10-25');
    expect(body.system).toContain('2026-11-02 to 2026-11-08');
    for (const key of ['temperature', 'top_p', 'top_k']) expect(body).not.toHaveProperty(key);
  });

  it('passes a refused search back as an error result so Claude can correct itself', async () => {
    const live = liveSearch(() => ({ error: 'out_date must be a date from 2026-10-19 to 2026-10-25.' }));
    const c = fakeClient(turn([useTool('t1', { out_date: '2026-12-01', destination: 'main' })]), DONE);
    await scoutFares(live, input, plan, c.deps);
    const result = userMessages(c.create, 1)[2].content[0];
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('out_date');
  });

  it('stops when Claude cannot be reached, keeping whatever was priced', async () => {
    const live = liveSearch(() => ok);
    const create = vi.fn()
      .mockImplementationOnce(async () => turn([useTool('t1', { out_date: '2026-10-21', back_date: '2026-11-04', destination: 'main' })]))
      .mockRejectedValueOnce(new Error('overloaded'));
    await expect(scoutFares(live, input, plan, { client: { messages: { create } } as unknown as Anthropic })).resolves.toBeUndefined();
    expect(live.calls).toHaveLength(1);
  });

  it('cannot loop forever, even if Claude keeps asking', async () => {
    const live = liveSearch(() => ok);
    const create = vi.fn(async () => turn([useTool('t', { out_date: '2026-10-21', back_date: '2026-11-04', destination: 'main' })]));
    await scoutFares(live, input, plan, { client: { messages: { create } } as unknown as Anthropic });
    expect(create.mock.calls.length).toBeLessThanOrEqual(live.budget + 2);
  });

  it('passes the monthly credit cap on when nothing at all was priced', async () => {
    const live = liveSearch(() => { throw new HttpError(503, 'BUSY', 'Live fares are at capacity this month.'); }, 0);
    const c = fakeClient(turn([useTool('t1', { out_date: '2026-10-21', back_date: '2026-11-04', destination: 'main' })]), DONE);
    await expect(scoutFares(live, input, plan, c.deps)).rejects.toMatchObject({ status: 503 });
  });

  it('keeps going with what it has when the cap is hit after some searches were priced', async () => {
    let n = 0;
    const live = liveSearch(() => { if (n++ === 0) return ok; throw new HttpError(503, 'BUSY', 'capacity'); }, 1);
    const c = fakeClient(
      turn([useTool('t1', { out_date: '2026-10-21', back_date: '2026-11-04', destination: 'main' }), useTool('t2', { out_date: '2026-10-22', back_date: '2026-11-05', destination: 'main' })]),
      DONE,
    );
    await expect(scoutFares(live, input, plan, c.deps)).resolves.toBeUndefined();
  });
});
