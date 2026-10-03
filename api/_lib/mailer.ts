// Sends transactional email through Brevo's REST API (free plan: 300 emails/day).
// Locally, with no key configured, the message is printed to the server console instead, so
// sign-up can be tried without an email account. On Vercel production/preview it must be configured.
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(mail: Mail): Promise<void> {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    const env = process.env.VERCEL_ENV;
    if (env === undefined || env === 'development') {
      console.log(`\n[mailer: no BREVO_API_KEY, printing instead]\nTo: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
      return;
    }
    throw new Error('Email is not configured (BREVO_API_KEY / EMAIL_FROM)');
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.EMAIL_FROM_NAME || 'flexfare', email: from },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    // Brevo's reason ("unrecognised IP", "sender not verified", ...) goes in the server log only, never to the user.
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Brevo responded ${res.status}: ${detail}`);
  }
}

export function verificationCodeEmail(code: string, minutes: number): Mail {
  const text = `Your flexfare verification code is ${code}.\n\nIt expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111317">
<p style="margin:0 0 12px">Your flexfare verification code is</p>
<p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:0 0 16px">${code}</p>
<p style="margin:0;color:#5b6169">It expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email.</p></div>`;
  return { to: '', subject: `Your flexfare code: ${code}`, text, html };
}
