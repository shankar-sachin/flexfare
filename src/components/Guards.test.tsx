// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

let auth: Record<string, unknown> = {};
vi.mock('../lib/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../lib/api', () => ({ useQuota: () => null, getMe: vi.fn() }));
const { Gate, GuestOnly } = await import('./Guards');

afterEach(cleanup);
const state = (over: object) => (auth = { configured: true, user: { uid: 'u' }, loading: false, emailVerified: true, phoneOnFile: true, signOut: vi.fn(), ...over });

const app = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/search" element={<Gate><p>secret search</p></Gate>} />
        <Route path="/signin" element={<GuestOnly><p>sign in form</p></GuestOnly>} />
        <Route path="/verify-email" element={<p>verify email page</p>} />
        <Route path="/add-phone" element={<p>add phone page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Gate', () => {
  it('lets a fully set up user through', () => {
    state({});
    app('/search');
    expect(screen.getByText('secret search')).toBeTruthy();
  });
  it('sends signed-out visitors to sign in', () => {
    state({ user: null });
    app('/search');
    expect(screen.getByText('sign in form')).toBeTruthy();
  });
  it('sends unverified emails to verify, then missing phones to add-phone', () => {
    state({ emailVerified: false, phoneOnFile: false });
    app('/search');
    expect(screen.getByText('verify email page')).toBeTruthy();
    cleanup();
    state({ phoneOnFile: false });
    app('/search');
    expect(screen.getByText('add phone page')).toBeTruthy();
  });
  it('shows a setup notice when Firebase is not configured', () => {
    state({ configured: false, user: null });
    app('/search');
    expect(screen.getByText(/isn't set up yet/)).toBeTruthy();
  });
  it('does not flash the app (or redirect) while auth is loading', () => {
    state({ loading: true, user: null });
    app('/search');
    expect(screen.queryByText('secret search')).toBeNull();
    expect(screen.queryByText('sign in form')).toBeNull();
  });
});

describe('GuestOnly', () => {
  it('moves signed-in users on to the app', () => {
    state({});
    render(
      <MemoryRouter initialEntries={['/signin']}>
        <Routes>
          <Route path="/signin" element={<GuestOnly><p>sign in form</p></GuestOnly>} />
          <Route path="/search" element={<p>reached search</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('reached search')).toBeTruthy();
  });
});
