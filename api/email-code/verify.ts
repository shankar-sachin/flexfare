import { z } from 'zod';
import { requireUser } from '../_lib/auth.js';
import { verifyEmailCode } from '../_lib/emailCode.js';
import { HttpError, handle, json } from '../_lib/http.js';

export const POST = handle(async (req) => {
  const user = await requireUser(req, { allowNoPhone: true, allowUnverifiedEmail: true });
  if (user.emailVerified) return json(200, { verified: true });
  const parsed = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, 'INVALID_CODE', 'Enter the 6-digit code from the email.');
  await verifyEmailCode(user.uid, parsed.data.code);
  return json(200, { verified: true });
});
