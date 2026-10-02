// Small blocklist of throwaway-email domains. Not exhaustive; it only raises the bar a little.
const DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  'grr.la', '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'throwawaymail.com', 'yopmail.com', 'yopmail.net', 'trashmail.com', 'trashmail.net', 'getnada.com',
  'nada.email', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mailnesia.com', 'mintemail.com',
  'mohmal.com', 'emailondeck.com', 'burnermail.io', 'spamgourmet.com', 'tempinbox.com', 'mytemp.email',
  'tmpmail.org', 'tmpmail.net', 'discard.email', 'mailcatch.com', 'moakt.com', 'inboxkitten.com',
  'anonbox.net', 'spambox.us', 'incognitomail.org', 'harakirimail.com', 'tempail.com', 'luxusmail.org',
  'mail.tm', 'tempr.email', 'fexpost.com', 'emailfake.com', 'crazymailing.com', 'cuvox.de',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  return !!domain && DOMAINS.has(domain);
}
