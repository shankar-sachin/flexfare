import { requireUser } from '../_lib/auth.js';
import { sendEmailCode } from '../_lib/emailCode.js';
import { handle, json } from '../_lib/http.js';

export const POST = handle(async (req) => {
  const user = await requireUser(req, { allowNoPhone: true, allowUnverifiedEmail: true });
  if (user.emailVerified) return json(200, { verified: true });
  const { sent, retryAfter } = await sendEmailCode(user.uid, user.email);
  return json(200, { verified: false, email: user.email, sent, retryAfter });
});
