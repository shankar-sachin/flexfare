# Environment variables

Copy `.env.example` to `.env`. Never commit `.env`, and never put a secret in a `VITE_` variable: those ship to the browser.

| Variable | Needed for | Where to get it |
|---|---|---|
| `VITE_FIREBASE_*` | Sign-in (public web config) | Firebase console, Project settings, Your apps |
| `FIREBASE_SERVICE_ACCOUNT_B64` | Server access to Firestore | Firebase console, Service accounts, base64 of the JSON key |
| `ANTHROPIC_API_KEY` | AI ranking, and choosing which days to price on SerpApi | console.anthropic.com |
| `CLAUDE_MODEL`, `CLAUDE_DEEP_MODEL`, `CLAUDE_SUMMARY_MODEL` | Optional model overrides | defaults `claude-sonnet-5-5`, `claude-opus-5-5` and `claude-haiku-5-5` |
| `FARE_PROVIDER` | Which fares to use | `serpapi`, `travelpayouts` or `simulated` |
| `SERPAPI_KEY` | Live Google Flights fares | serpapi.com |
| `TRAVELPAYOUTS_TOKEN` | Cached Aviasales fares | travelpayouts.com |
| `BREVO_API_KEY`, `EMAIL_FROM` | Emailing verification codes | brevo.com |
| `PHONE_HASH_SECRET`, `DAILY_SALT`, `EMAIL_CODE_SECRET` | Hashing phones, IPs and codes | any long random string |
| `BOOK_DAILY_LIMIT` | Direct checkout lookups per user per day (each costs 1 to 2 SerpApi credits) | default 6 |
| `BOOKING_SECRET` | Signs the checkout lookup reference sent with each route | any long random string; falls back to `DAILY_SALT` |
| `ADMIN_EMAILS` | Admin accounts: no daily limits, plus the `/admin` page (SerpApi credits, searches, Claude tokens and estimated cost) | comma-separated emails. Only a verified email counts. Set it in Vercel, not in git |

The daily limits can be changed with `DAILY_REGULAR_LIMIT`, `DAILY_DEEP_LIMIT`, `IP_DAILY_LIMIT` and `GLOBAL_DAILY_LIMIT`.
