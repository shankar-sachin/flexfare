# Environment variables

Copy `.env.example` to `.env`. Never commit `.env`, and never put a secret in a `VITE_` variable: those ship to the browser.

| Variable | Needed for | Where to get it |
|---|---|---|
| `VITE_FIREBASE_*` | Sign-in (public web config) | Firebase console, Project settings, Your apps |
| `FIREBASE_SERVICE_ACCOUNT_B64` | Server access to Firestore | Firebase console, Service accounts, base64 of the JSON key |
| `GROQ_API_KEY` | AI ranking | console.groq.com |
| `GROQ_MODEL`, `GROQ_DEEP_MODEL` | Optional model overrides | defaults `openai/gpt-oss-20b` and `openai/gpt-oss-120b` |
| `FARE_PROVIDER` | Which fares to use | `serpapi`, `travelpayouts` or `simulated` |
| `SERPAPI_KEY` | Live Google Flights fares | serpapi.com |
| `TRAVELPAYOUTS_TOKEN` | Cached Aviasales fares | travelpayouts.com |
| `BREVO_API_KEY`, `EMAIL_FROM` | Emailing verification codes | brevo.com |
| `PHONE_HASH_SECRET`, `DAILY_SALT`, `EMAIL_CODE_SECRET` | Hashing phones, IPs and codes | any long random string |

The daily limits can be changed with `DAILY_REGULAR_LIMIT`, `DAILY_DEEP_LIMIT`, `IP_DAILY_LIMIT` and `GLOBAL_DAILY_LIMIT`.
