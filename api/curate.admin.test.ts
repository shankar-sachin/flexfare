import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatIsoWeek, upcomingWeeks } from '../src/shared/weeks';

const state = { isAdmin: false };
const consumeQuota = vi.fn(async () => ({ regular: { used: 1, limit: 4 }, deep: { used: 0, limit: 1 } }));
const refundQuota = vi.fn(async () => undefined);
const peekQuota = vi.fn(async () => ({ regular: { used: 2, limit: 4 }, deep: { used: 0, limit: 1 }, resetsAt: '2026-11-19T00:00:00.000Z' }));
const route = { id: 'r1', price: 500 };
let result: Record<string, unknown> = {};

vi.mock('./_lib/auth.js', () => ({ requireUser: async () => ({ uid: 'u1', email: 'a@b.c', phoneOnFile: true, emailVerified: true, isAdmin: state.isAdmin }) }));
vi.mock('./_lib/quota.js', () => ({ consumeQuota: (...a: unknown[]) => consumeQuota(...(a as [])), refundQuota: (...a: unknown[]) => refundQuota(...(a as [])), peekQuota: () => peekQuota(), hashIp: () => 'iphash' }));
vi.mock('./_lib/cache.js', () => ({ cacheGet: async () => null, cacheSet: async () => undefined, hashKey: () => 'k' }));
vi.mock('./_lib/firestore.js', () => ({ db: () => ({ collection: () => ({ doc: () => ({ collection: () => ({ add: async () => undefined }) }) }) }) }));
vi.mock('./_lib/pipeline.js', () => ({ runCuration: async () => result, getWeekFares: async () => [] }));

const { POST } = await import('./curate');
const weeks = upcomingWeeks();
const request = () =>
  new Request('https://x.test/api/curate', {
    method: 'POST',
    body: JSON.stringify({ from: 'SFO', to: 'LIS', out: formatIsoWeek(weeks[2]), back: formatIsoWeek(weeks[4]), stay: 'range', prio: 'balance', pax: 1, cabin: 'economy', depth: 'regular' }),
  });

describe('POST /api/curate: daily limits', () => {
  beforeEach(() => {
    consumeQuota.mockClear();
    refundQuota.mockClear();
    result = { headline: 'h', summary: 's', routes: [route], aiFallback: false, weekFares: [] };
  });

  it('counts a normal user’s search against their quota', async () => {
    state.isAdmin = false;
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(consumeQuota).toHaveBeenCalledTimes(1);
    expect((await res.json()).quota.unlimited).toBeUndefined();
  });

  it('does not count or limit an admin, and shows them as unlimited', async () => {
    state.isAdmin = true;
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(consumeQuota).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.quota).toMatchObject({ unlimited: true, admin: true });
    expect(body.routes).toHaveLength(1);
  });

  it('has nothing to refund for an admin when no fares were found, and still refunds a normal user', async () => {
    result = { headline: 'none', summary: 's', routes: [], weekFares: [] };
    state.isAdmin = true;
    await POST(request());
    expect(refundQuota).not.toHaveBeenCalled();
    state.isAdmin = false;
    await POST(request());
    expect(refundQuota).toHaveBeenCalledTimes(1);
  });
});
