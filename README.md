# flexfare

Pick the week. We'll find the flight.

flexfare searches city to city (every airport in each city) across whole weeks instead of fixed dates, then uses AI to shortlist the best routes and explain why each one made the cut. It finds flights and links you to Google Flights, Skyscanner or Aviasales to book. It does not sell tickets.

- Free accounts only: email + password, Google, or magic link. Email must be verified, and a phone number is collected (not verified, no SMS).
- 5 AI searches per day per user. Repeat searches within 6 hours are cached and free.
- Signed-out visitors can open a fixed demo at `/demo`.

## Run it

```bash
npm install
npm run dev:web      # front end only, http://localhost:5173 (landing page + demo work with no setup)
npm run dev          # front end + /api functions, needs the Vercel CLI (`npx vercel dev`)
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

**Fares**: sign up at travelpayouts.com, copy your API token and marker into `TRAVELPAYOUTS_TOKEN` / `TRAVELPAYOUTS_MARKER`, and set `FARE_PROVIDER=travelpayouts`. With `FARE_PROVIDER=simulated` (the default) the server returns deterministic fake fares labelled "Sample data".

**Secrets**: set `DAILY_SALT` and `PHONE_HASH_SECRET` to long random strings (`openssl rand -hex 32`).

**Deploy**: `npx vercel` to link, add every variable from `.env.example` in the Vercel dashboard, then `npx vercel --prod`.

## Notes

- Fares come from a cache of recent Aviasales searches, so they are estimates, not live availability.
- The AI only ranks and explains candidates. Prices, dates and airlines always come from the fare provider, and any dollar amount in the AI's text is checked against the real data before it is shown.
- See `CLAUDE.md` for the architecture and design rules.

Licensed under the Apache License 2.0. See `LICENSE`.
