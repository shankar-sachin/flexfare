# Security policy

## Reporting a vulnerability

**Please don't open a public issue or pull request for a security problem.** Report it privately instead:

1. Go to the [Security tab](https://github.com/shankar-sachin/flexfare/security) of this repository.
2. Choose **Report a vulnerability** ([direct link](https://github.com/shankar-sachin/flexfare/security/advisories/new)).

Please include:

- what the problem is and where (a URL, endpoint or file),
- the steps to reproduce it, or a short proof of concept,
- what an attacker could do with it.

I'll read every report, reply as soon as I can (this is a one-person project, so I can't promise a fixed time), keep you updated, and credit you in the fix if you'd like.

## What's in scope

The code in this repository and the live site at [flexfare.vercel.app](https://flexfare.vercel.app), for example:

- getting around the sign-in, email-code or per-account, per-connection and global search limits,
- reading or changing another user's account, searches or data,
- exposing a secret (an API key, a service account, the hashing keys),
- injecting script or content into pages, or abusing the API (`/api/*`).

## What's out of scope

- Problems in services flexfare uses (Firebase, Vercel, Groq, SerpApi, Brevo, Travelpayouts). Please report those to the provider.
- Findings that need a rooted or already-compromised device, social engineering, or physical access.
- Volume-only attacks (denial of service by sheer traffic) and automated scanner output without a real, demonstrated impact.
- The phone number is collected but not verified, as a deliberate speed bump against duplicate accounts. Entering a made-up number is expected and is not a vulnerability.

## Supported versions

Only the latest version on `main` (what is deployed at flexfare.vercel.app) receives security fixes.

## If you find a secret in the repository

Don't use it. Report it privately as above so it can be replaced. `.env` files are never committed, and secrets live only in the hosting provider's settings.

## How flexfare handles your data

Accounts use Firebase Authentication. The database is only reachable from the server (browsers are denied by default). Phone numbers are stored only as a keyed hash, and email codes are stored only as a keyed hash and expire after 10 minutes. Passwords never reach flexfare: Firebase handles them.
