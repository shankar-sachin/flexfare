/** Friendly text for Firebase Auth error codes. Returns '' for errors the user caused on purpose (closing the popup). */
export function authMessage(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email already has an account. Try signing in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password didn't match.";
    case 'auth/invalid-email':
      return 'That email address looks off. Check it and try again.';
    case 'auth/weak-password':
      return 'Use a longer password (at least 8 characters).';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'That sign-in link has expired or was already used. Request a new one.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

const KEY = 'flexfare.emailForSignIn';
export const rememberEmail = (email: string) => {
  try {
    window.localStorage.setItem(KEY, email);
  } catch {
    /* storage blocked: the finish page asks for the email again */
  }
};
export const recalledEmail = () => {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
export const forgetEmail = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
