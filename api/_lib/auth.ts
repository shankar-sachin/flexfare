import { isDisposableEmail } from '../../src/shared/disposable.js';
import { adminAuth } from './firestore.js';
import { HttpError } from './http.js';

export interface AuthedUser {
  uid: string;
  email: string;
  phoneOnFile: boolean;
  emailVerified: boolean;
}

interface Options {
  /** Skip the phone-on-file check (the phone step itself, the email-code step, account deletion). */
  allowNoPhone?: boolean;
  /** Skip the verified-email check (the email-code step itself, the phone step, account deletion). */
  allowUnverifiedEmail?: boolean;
}

/**
 * Verifies the Firebase ID token and the sign-up gates, in the order users meet them:
 * phone number on file, then verified email. Everything else needs both.
 */
export async function requireUser(req: Request, opts: Options = {}): Promise<AuthedUser> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to use flexfare.');

  // Outside the try: a broken service account is OUR bug (500 + log), not an expired session.
  const admin = adminAuth();
  let decoded;
  try {
    decoded = await admin.verifyIdToken(token, true);
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Your session expired. Please sign in again.');
  }
  if (decoded.email && isDisposableEmail(decoded.email)) throw new HttpError(403, 'EMAIL_BLOCKED', 'Please use a permanent email address.');
  const phoneOnFile = decoded.phoneOnFile === true;
  const emailVerified = decoded.email_verified === true;
  if (!opts.allowNoPhone && !phoneOnFile) throw new HttpError(403, 'PHONE_REQUIRED', 'Add a phone number to continue.');
  if (!opts.allowUnverifiedEmail && !emailVerified) throw new HttpError(403, 'EMAIL_UNVERIFIED', 'Verify your email to continue.');
  return { uid: decoded.uid, email: decoded.email ?? '', phoneOnFile, emailVerified };
}
