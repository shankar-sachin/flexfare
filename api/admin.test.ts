import { describe, expect, it, vi } from 'vitest';

const state = { isAdmin: false };
vi.mock('./_lib/auth.js', () => ({ requireUser: async () => ({ uid: 'u1', email: 'a@b.c', phoneOnFile: true, emailVerified: true, isAdmin: state.isAdmin }) }));
vi.mock('./_lib/adminStats.js', () => ({ getAdminStats: async () => ({ generatedAt: 'now', days: [], serpapi: { month: '2026-11', used: 3, limit: 100 } }) }));

const { GET } = await import('./admin');

describe('GET /api/admin', () => {
  it('is forbidden for anyone who is not an admin, and shows them nothing', async () => {
    state.isAdmin = false;
    const res = await GET(new Request('https://x.test/api/admin'));
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain('serpapi');
  });

  it('gives an admin the stats', async () => {
    state.isAdmin = true;
    const res = await GET(new Request('https://x.test/api/admin'));
    expect(res.status).toBe(200);
    expect((await res.json()).serpapi.used).toBe(3);
  });
});
