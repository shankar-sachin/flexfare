# flexfare

## 🔗 [flexfare.vercel.app](https://flexfare.vercel.app/)

Pick the week. We'll find the flight.

flexfare searches city to city (every airport in each city) across whole weeks instead of fixed dates, then uses AI to shortlist the best routes and explain why each one made the cut. It finds flights and shows where to book them: directly with the airline (recommended), or on Google Flights, Skyscanner, Expedia or Kayak. It does not sell tickets.

- Free accounts only: email + password (full name, confirm password, live strength meter), Google, or magic link. Sign-up order: phone number (collected, not verified, no SMS) then a 6-digit code emailed to you. Google and magic-link accounts skip the code, since those already prove the email.
- Pick your weeks on a month-by-month calendar, up to six months ahead (returns up to 12 weeks after leaving).
- Each user gets 4 regular searches (small, cheap AI model) and 1 Deep Search (larger model, looks at more options with more reasoning) per day. Repeat searches within 6 hours are cached and free.
- Signed-out visitors can open a fixed demo at `/demo`.

## Run it

```bash
npm install
npm run dev          # front end only, http://localhost:5173 (landing page + demo work with no setup)
npm run dev:full     # front end + /api functions via `vercel dev` (needed for sign-in and search)
npm test             # unit + component tests
npm run typecheck
npm run build
```

Copy `.env.example` to `.env` and fill it in (never commit `.env`).

## One-time setup

**Firebase** (free Spark plan is enough):
1. Create a project. Authentication -> Sign-in method: enable Email/Password (with Email link) and Google.
2. Authentication -> Settings -> Authorized domains: add `localhost` and your Vercel domain.
3. Create a Firestore database (production mode). Paste `firestore.rules` into the Rules tab. Only the server touches data.
4. Project settings -> Your apps -> Web app: copy the config into the four `VITE_FIREBASE_*` variables.
5. Project settings -> Service accounts -> Generate new private key. Base64 it into `FIREBASE_SERVICE_ACCOUNT_B64`:
   `base64 -i key.json | tr -d '\n'`

**Groq**: create a key at console.groq.com and set `GROQ_API_KEY`.

**Fares**: set `FARE_PROVIDER` to one of:
- `serpapi` (recommended): live Google Flights prices with real flight times, airlines and layovers. Sign up free at serpapi.com, copy your API key into `SERPAPI_KEY`. The free plan is about 100 searches a month and each search is one credit, so each flexfare search prices only the few day combinations that fit best: 3 for a regular search (+1 if there is a nearby airport such as Porto for Lisbon) and 5 for a Deep Search. Results are cached for a day and shared between users, and `SERPAPI_MONTHLY_LIMIT` (default 100) stops flexfare from ever going past your plan. The "from $X" week bars are not available with this source.
- `travelpayouts`: free, but it only remembers prices from recent searches on Aviasales, so many routes and weeks come back empty. Needs `TRAVELPAYOUTS_TOKEN` (the marker is optional and only credits bookings to you).
- `simulated` (default): fake fares labelled "Sample data", for development.

**Email codes (Brevo, free: 300 emails/day)**:
1. Sign up at brevo.com. Under **Senders, Domains & Dedicated IPs -> Senders**, add the address you want codes to come from (for example your own Gmail) and click the confirmation link Brevo emails you.
2. Under **SMTP & API -> API keys**, generate a key.
3. Set `BREVO_API_KEY`, `EMAIL_FROM` (that verified sender address) and `EMAIL_CODE_SECRET` (`openssl rand -hex 32`).

With no key set, codes are printed in the `vercel dev` terminal instead of emailed, which is handy for trying sign-up locally. That fallback is disabled on Vercel preview and production, where a missing key is an error.

**Secrets**: set `DAILY_SALT` and `PHONE_HASH_SECRET` to long random strings (`openssl rand -hex 32`).

**Deploy**: `npx vercel` to link, add every variable from `.env.example` in the Vercel dashboard, then `npx vercel --prod`.

## Notes

- Fares come from a cache of recent Aviasales searches, so they are estimates, not live availability.
- The AI only ranks and explains candidates. Prices, dates and airlines always come from the fare provider, and any dollar amount in the AI's text is checked against the real data before it is shown.
- See `CLAUDE.md` for the architecture and design rules.

Licensed under the Apache License 2.0. See `LICENSE`.
