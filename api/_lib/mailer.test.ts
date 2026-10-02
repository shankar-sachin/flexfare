import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail, verificationCodeEmail } from './mailer';

const mail = { to: 'a@example.com', subject: 's', text: 't', html: '<p>h</p>' };
const keep = { ...process.env };
beforeEach(() => {
  delete process.env.BREVO_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.VERCEL_ENV;
});
afterEach(() => {
  process.env = { ...keep };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('verificationCodeEmail', () => {
  it('puts the code in the subject and both bodies', () => {
    const m = verificationCodeEmail('482913', 10);
    expect(m.subject).toContain('482913');
    expect(m.text).toContain('482913');
    expect(m.html).toContain('482913');
    expect(m.text).toContain('10 minutes');
  });
});

describe('sendEmail', () => {
  it('prints instead of sending when unconfigured locally', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await sendEmail(mail);
    expect(f).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0][0])).toContain('a@example.com');
  });

  it('refuses to silently skip sending in production', async () => {
    process.env.VERCEL_ENV = 'production';
    await expect(sendEmail(mail)).rejects.toThrow(/not configured/);
    process.env.VERCEL_ENV = 'preview';
    await expect(sendEmail(mail)).rejects.toThrow(/not configured/);
  });

  it('posts the right request to Brevo', async () => {
    process.env.BREVO_API_KEY = 'k';
    process.env.EMAIL_FROM = 'hello@flexfare.test';
    process.env.EMAIL_FROM_NAME = 'flexfare';
    const f = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', f);
    await sendEmail(mail);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('k');
    const body = JSON.parse(String(init.body));
    expect(body.sender).toEqual({ name: 'flexfare', email: 'hello@flexfare.test' });
    expect(body.to).toEqual([{ email: 'a@example.com' }]);
    expect(body.subject).toBe('s');
  });

  it('throws when Brevo rejects', async () => {
    process.env.BREVO_API_KEY = 'k';
    process.env.EMAIL_FROM = 'hello@flexfare.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"unrecognised IP address"}', { status: 401 })));
    await expect(sendEmail(mail)).rejects.toThrow(/401.*unrecognised IP/);
  });
});
