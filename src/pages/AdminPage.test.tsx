// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminStats } from '../shared/types';

const getAdminStats = vi.fn();
vi.mock('../lib/api', async () => {
  class ApiError extends Error {
    constructor(public code: string, message: string, public status = 0) {
      super(message);
    }
  }
  return { ApiError, getAdminStats: () => getAdminStats(), useQuota: () => null, getMe: async () => undefined };
});
vi.mock('../lib/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u' }, loading: false, emailVerified: true, phoneOnFile: true, signOut: async () => undefined }) }));

const { AdminPage } = await import('./AdminPage');
const { ApiError } = await import('../lib/api');

afterEach(cleanup);
const stats: AdminStats = {
  generatedAt: '2026-11-18T12:00:00.000Z',
  serpapi: { month: '2026-11', used: 37, limit: 100 },
  limits: { regular: 4, deep: 1, ip: 15, global: 300, bookPerUser: 6 },
  days: [
    { day: '2026-11-18', searches: 12, claudeCalls: 30, tokensIn: 50_000, tokensOut: 9_000, costUsd: 0.21, models: [{ model: 'claude-sonnet-5-5', calls: 30, tokensIn: 50_000, tokensOut: 9_000, costUsd: 0.21 }] },
    { day: '2026-11-17', searches: 0, claudeCalls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, models: [] },
  ],
  config: { fareProvider: 'serpapi', claudeModel: 'claude-sonnet-5-5', claudeDeepModel: 'claude-opus-5-5', claudeSummaryModel: 'claude-haiku-5-5', claudeConfigured: true, admins: 1 },
};
const show = () => render(<MemoryRouter><AdminPage /></MemoryRouter>);

describe('AdminPage', () => {
  it('shows the credits, today’s searches and Claude cost, and the daily table', async () => {
    getAdminStats.mockResolvedValueOnce(stats);
    show();
    await waitFor(() => expect(screen.getByText('37 / 100')).toBeTruthy());
    expect(screen.getByText('12 / 300')).toBeTruthy();
    expect(screen.getAllByText('$0.210').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-11-17')).toBeTruthy();
    expect(screen.getByText(/Claude key: set/)).toBeTruthy();
  });

  it('says plainly that the page is for admins when the server refuses', async () => {
    getAdminStats.mockRejectedValueOnce(new ApiError('FORBIDDEN', 'This page is for admins.', 403));
    show();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('for admins'));
  });
});
