import { isDisposableEmail } from '../../src/shared/disposable.js';
import { adminAuth } from './firestore.js';
import { HttpError } from './http.js';

export interface AuthedUser {
  uid: string;
  email: string;
  phoneOnFile: boolean;
}

interface Options {
  /** Skip the phone-on-file check (only /api/add-phone does this). */
  allowNoPhone?: boolean;
}

/** Verifies the Firebase ID token and the sign-up gates (verified email, phone on file). */
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
  if (!decoded.email_verified) throw new HttpError(403, 'EMAIL_UNVERIFIED', 'Verify your email to continue.');
  if (!opts.allowNoPhone && decoded.phoneOnFile !== true) throw new HttpError(403, 'PHONE_REQUIRED', 'Add a phone number to continue.');
  return { uid: decoded.uid, email: decoded.email ?? '', phoneOnFile: decoded.phoneOnFile === true };
}
