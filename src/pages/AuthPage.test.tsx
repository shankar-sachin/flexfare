// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createUser = vi.fn();
const updateProfile = vi.fn();
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  createUserWithEmailAndPassword: (...a: unknown[]) => createUser(...a),
  updateProfile: (...a: unknown[]) => updateProfile(...a),
  sendPasswordResetEmail: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
}));
vi.mock('../lib/firebase', () => ({ auth: { name: 'auth' } }));
vi.mock('../lib/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }) }));
vi.mock('../lib/api', () => ({ useQuota: () => null, getMe: vi.fn() }));
const { AuthPage } = await import('./AuthPage');

const STRONG = 'correct horse battery staple';
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const button = () => screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement;
const setup = () => render(<MemoryRouter><AuthPage mode="signup" /></MemoryRouter>);

beforeEach(() => {
  createUser.mockReset().mockResolvedValue({ user: { uid: 'u' } });
  updateProfile.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('sign-up form', () => {
  it('asks for a name, email, password and confirmation', () => {
    setup();
    for (const l of ['Full name', 'Email', 'Password', 'Confirm password']) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(button().disabled).toBe(true);
  });

  it('shows a live strength meter that moves from weak to strong', () => {
    setup();
    expect(screen.queryByRole('meter')).toBeNull();
    type('Password', 'abc');
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('Too short');
    type('Password', 'password123');
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('Weak');
    type('Password', STRONG);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuetext')).toBe('Strong');
    expect(meter.querySelectorAll('.is-on')).toHaveLength(4);
  });

  it("won't enable submit for a weak password, a missing name, or a mismatch", () => {
    setup();
    type('Full name', 'Sachin Shankar');
    type('Email', 'me@example.com');
    type('Password', 'password123');
    type('Confirm password', 'password123');
    expect(button().disabled).toBe(true); // too weak
    type('Password', STRONG);
    expect(screen.getByText("Passwords don't match yet")).toBeTruthy();
    expect(button().disabled).toBe(true);
    type('Confirm password', STRONG);
    expect(screen.getByText('Passwords match')).toBeTruthy();
    expect(button().disabled).toBe(false);
    type('Full name', 'S');
    expect(button().disabled).toBe(true); // name too short
  });

  it("rejects a password made from the person's own name", () => {
    setup();
    type('Full name', 'Sachin Shankar');
    type('Password', 'Sachin-2026-xyz');
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('Weak');
    expect(screen.getByText(/name or email/)).toBeTruthy();
  });

  it('creates the account and saves the name', async () => {
    setup();
    type('Full name', '  Sachin Shankar ');
    type('Email', 'me@example.com');
    type('Password', STRONG);
    type('Confirm password', STRONG);
    fireEvent.click(button());
    await waitFor(() => expect(createUser).toHaveBeenCalledWith({ name: 'auth' }, 'me@example.com', STRONG));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ uid: 'u' }, { displayName: 'Sachin Shankar' }));
  });

  it('blocks throwaway emails, and the message goes away once you edit', async () => {
    setup();
    type('Full name', 'Sachin Shankar');
    type('Email', 'x@mailinator.com');
    type('Password', STRONG);
    type('Confirm password', STRONG);
    fireEvent.click(button());
    await screen.findByText('Please use a permanent email address.');
    expect(createUser).not.toHaveBeenCalled();
    type('Email', 'x@example.com');
    expect(screen.queryByText('Please use a permanent email address.')).toBeNull();
  });

  it('toggles password visibility', () => {
    setup();
    const field = screen.getByLabelText('Password') as HTMLInputElement;
    expect(field.type).toBe('password');
    fireEvent.click(screen.getAllByRole('button', { name: 'Show' })[0]);
    expect(field.type).toBe('text');
  });
});
