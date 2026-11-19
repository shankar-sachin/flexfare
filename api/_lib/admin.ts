// Admin accounts: a comma-separated list of emails in ADMIN_EMAILS (kept out of the code so nothing personal is
// committed). Only a VERIFIED email counts, so nobody can become admin by signing up with someone else's address.
import { UNLIMITED_SEARCHES, type QuotaSummary } from '../../src/shared/types.js';

export const adminEmails = (): Set<string> =>
  new Set((process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

export const isAdminEmail = (email: string | null | undefined, verified: boolean): boolean =>
  verified && !!email && adminEmails().has(email.trim().toLowerCase());

/** What an admin sees instead of daily limits. */
export const unlimitedQuota = (q: QuotaSummary): QuotaSummary => ({
  regular: { used: 0, limit: UNLIMITED_SEARCHES },
  deep: { used: 0, limit: UNLIMITED_SEARCHES },
  resetsAt: q.resetsAt,
  unlimited: true,
  admin: true,
});
