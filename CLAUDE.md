# flexfare: notes for Claude Code

flexfare is a flight search front-end with two ideas at its core:

1. **City to city, not airport to airport.** A `City` expands to all its airports (San Francisco = SFO, OAK, SJC) plus optional `nearby` arrivals reachable by ground transport (Lisbon + Porto by train).
2. **Weeks, not dates.** Users pick a leave week and a return week (ISO weeks, Mon–Sun). Every day in both weeks is searched, and an AI ranks the results by price and fit.

## Stack

- Vite + React 18 + TypeScript (strict), react-router-dom v7, Firebase Auth (client), Vitest
- Backend: Vercel serverless functions in `api/` (Web `Request`/`Response` handlers, Node runtime), Firebase Admin + Firestore, Groq for the AI step
- Plain CSS with design tokens. No CSS framework.

```bash
npm install
npm run dev        # front end only (landing + demo work with no env)
npm run dev:full   # front end + api via `vercel dev` (its dev command is plain `vite`, never `vercel dev`: that recurses)
npm test           # vitest
npm run typecheck  # app + api
npm run build
```

## Product rules

1. **City to city, not airport to airport.** A `City` (IATA city code like SFO, NYC, LON) expands to all its airports, plus optional `nearby` arrivals reachable by ground transport (`api/_lib/nearby.ts`).
2. **Weeks, not dates.** Users pick a leave week and a return week (ISO weeks, Mon-Sun). Every day in both weeks is searched.
3. **Accounts are required to search.** Gate order: signed in -> phone on file (collected, NOT verified) -> email verified. Email is verified with a 6-digit code we email through Brevo (`api/email-code/*`, rules in `api/_lib/emailCodeLogic.ts`: 10 min expiry, 5 wrong tries, 1 send/min, 5 sends/hour, only an HMAC of the code is stored). Google/magic-link accounts arrive already verified. Signed-out users get a fixed demo at `/demo` (no API calls).
4. **Limits (server-side, one Firestore transaction):** 5 searches/user/day, 15/IP/day, 300 global/day. Same search within 6h is cached and free. Quota is refunded if our side fails or nothing is found.
5. **The LLM never invents data.** Fares come from the provider; `scoring.ts` precomputes every comparison; `groq.ts` rejects answers with unknown ids, reused badges, or any `$` amount not in the data, retries once, then falls back to a deterministic ranking (`aiFallback`).
6. flexfare doesn't sell tickets. It links out (`src/shared/links.ts`). Fares are estimates.

## Layout

```
api/                        Vercel functions: curate, week-fares, places, me (GET/DELETE), add-phone
  _lib/                     auth, quota, cache, validate, scoring, prompt, groq, pipeline, nearby, phone,
                            firestore, http; providers/{travelpayouts,simulated,index,types}
src/
  shared/                   code used by both sides: types, weeks, links, disposable (email blocklist)
  lib/                      firebase, AuthContext, SearchContext, api (authed fetch + quota store),
                            queryUrl (SearchQuery <-> URL), useUrlQuery, useCuration, authErrors, popularCities
  demo/demoResult.ts        fixed sample search for signed-out visitors
  components/               Header, Guards (Gate/GuestOnly/NeedsUser), SearchPanel, CityField (autocomplete),
                            WeekPicker, DayPicker, RouteCard, FindLinks, AuthShell, ...
  pages/                    Landing, Search, Results (demo prop), Route (demo prop), Auth, FinishEmailLink,
                            VerifyEmail (code entry), AddPhone, Account
```

Routes: `/` `/demo` `/demo/route/:id` `/signup` `/signin` `/auth/finish` `/verify-email` `/add-phone` (open),
`/search` `/results?...` `/route/:id?...` `/account` (gated). Results state lives in the URL (`queryUrl.ts`).

## Known gaps

- `api/_lib/providers/travelpayouts.ts` was written from the docs and has not been run against a live token. Check real responses and add fixtures in `providers/__fixtures__/`.
- The phone number is a speed bump only (fake numbers get through). Real protection is the email check plus per-IP and global limits.
- Watchlist and price alerts are not built. Day-picker deltas are across all flights seen between the two cities, not per route.
- No end-to-end test against a real Firebase project; the API handlers are covered through their `_lib` pieces.

## Design rules (keep these)

- Palette: ink `#111317`, ground `#F4F5F6`, signal yellow `#FFC72C`. Yellow is a **fill only**: never yellow text on white (fails contrast). Yellow text is OK on ink.
- Type: Archivo (display at `font-stretch` 108–118%, weight 800–900) + IBM Plex Mono for codes, prices, week numbers.
- Small labels are lowercase or mono caps; the hero kicker is lowercase on purpose.
- Logo: `components/Logo.tsx`, a lowercase "f" whose crossbar breaks off into a dot (the arrival). Also in `public/logo.svg` and `public/favicon.svg`.
- Touch targets ≥ 44px. Toggles are real `<button aria-pressed>`. Must work at 390px wide with no horizontal scroll.
- Copy is plain and specific ("$123 cheaper, 3½ hours longer"), never hype. No emoji.
- Fares are always labelled as estimates until checkout.
