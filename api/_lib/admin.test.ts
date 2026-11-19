import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UNLIMITED_SEARCHES } from '../../src/shared/types';
import { adminEmails, isAdminEmail, unlimitedQuota } from './admin';

const keep = process.env.ADMIN_EMAILS;
beforeEach(() => {
  process.env.ADMIN_EMAILS = 'boss@example.com';
});
afterEach(() => {
  if (keep === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = keep;
});

describe('isAdminEmail', () => {
  it('accepts a listed, verified email, whatever its case or spacing', () => {
    expect(isAdminEmail('boss@example.com', true)).toBe(true);
    expect(isAdminEmail('  Boss@Example.COM ', true)).toBe(true);
  });

  it('never accepts an unverified email, so signing up with an admin address is not enough', () => {
    expect(isAdminEmail('boss@example.com', false)).toBe(false);
  });

  it('rejects anyone not on the list, lookalikes included', () => {
    for (const e of ['other@example.com', 'boss@example.com.evil.io', 'boss+x@example.com', 'xboss@example.com', '', null, undefined]) {
      expect(isAdminEmail(e, true), String(e)).toBe(false);
    }
  });

  it('is nobody when the list is empty or unset', () => {
    process.env.ADMIN_EMAILS = '';
    expect(isAdminEmail('boss@example.com', true)).toBe(false);
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('boss@example.com', true)).toBe(false);
    expect(adminEmails().size).toBe(0);
  });

  it('reads several emails separated by commas', () => {
    process.env.ADMIN_EMAILS = 'a@x.com, b@y.com ,,';
    expect(adminEmails().size).toBe(2);
    expect(isAdminEmail('b@y.com', true)).toBe(true);
  });
});

describe('unlimitedQuota', () => {
  it('shows no limits, keeps the reset time, and marks the account as admin', () => {
    const q = unlimitedQuota({ regular: { used: 3, limit: 4 }, deep: { used: 1, limit: 1 }, resetsAt: '2026-11-19T00:00:00.000Z' });
    expect(q).toEqual({ regular: { used: 0, limit: UNLIMITED_SEARCHES }, deep: { used: 0, limit: UNLIMITED_SEARCHES }, resetsAt: '2026-11-19T00:00:00.000Z', unlimited: true, admin: true });
  });
});
