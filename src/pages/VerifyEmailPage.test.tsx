// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let auth: Record<string, unknown> = {};
vi.mock('../lib/AuthContext', () => ({ useAuth: () => auth }));
const sendEmailCode = vi.fn();
const verifyEmailCode = vi.fn();
vi.mock('../lib/api', () => {
  class ApiError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    ApiError,
    useQuota: () => null,
    getMe: vi.fn(),
    sendEmailCode: () => sendEmailCode(),
    verifyEmailCode: (c: string) => verifyEmailCode(c),
  };
});
const { VerifyEmailPage } = await import('./VerifyEmailPage');
const { ApiError } = await import('../lib/api');

const refresh = vi.fn();
const state = (over: object = {}) =>
  (auth = { user: { email: 'yourname@example.com' }, emailVerified: false, phoneOnFile: true, refresh, signOut: vi.fn(), ...over });
const setup = () =>
  render(
    <MemoryRouter initialEntries={['/verify-email']}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/search" element={<p>reached search</p>} />
        <Route path="/add-phone" element={<p>add phone page</p>} />
      </Routes>
    </MemoryRouter>,
  );
const codeBox = () => screen.getByLabelText('Enter code') as HTMLInputElement;

beforeEach(() => {
  refresh.mockReset().mockResolvedValue(undefined);
  sendEmailCode.mockReset().mockResolvedValue({ verified: false, sent: true, retryAfter: 60 });
  verifyEmailCode.mockReset().mockResolvedValue({ verified: true });
  state();
});
afterEach(cleanup);

describe('VerifyEmailPage', () => {
  it('says the email was chosen and where the code went, and sends exactly one code', async () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Verification' })).toBeTruthy();
    expect(screen.getByText(/Email chosen\. Email sent to/).textContent).toContain('yourname@example.com');
    expect(screen.getByLabelText('Enter code')).toBeTruthy();
    await waitFor(() => expect(sendEmailCode).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/link/i)).toBeNull();
  });

  it('only accepts digits and submits when the sixth is typed', async () => {
    setup();
    fireEvent.change(codeBox(), { target: { value: '12ab34' } });
    expect(codeBox().value).toBe('1234');
    expect(verifyEmailCode).not.toHaveBeenCalled();
    fireEvent.change(codeBox(), { target: { value: '123456' } });
    await waitFor(() => expect(verifyEmailCode).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows the server message for a wrong code and clears the box', async () => {
    verifyEmailCode.mockRejectedValue(new ApiError('INVALID_CODE', "That code didn't match."));
    setup();
    fireEvent.change(codeBox(), { target: { value: '000000' } });
    await screen.findByText("That code didn't match.");
    expect(codeBox().value).toBe('');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('makes you wait before asking for another code', async () => {
    setup();
    const resend = await screen.findByRole('button', { name: /Send a new code in \d+s/ });
    expect((resend as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends people on once verified, or back to the phone step if it is missing', () => {
    state({ emailVerified: true });
    setup();
    expect(screen.getByText('reached search')).toBeTruthy();
    cleanup();
    state({ phoneOnFile: false });
    setup();
    expect(screen.getByText('add phone page')).toBeTruthy();
  });
});
