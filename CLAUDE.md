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
2. **Weeks, not dates.** Users pick a leave week and a return week (ISO weeks, Mon-Sun). Three trip types (`SearchQuery.trip`): `round` (leave + return week), `oneway` (leave week only; stay length is hidden), `multi` (2 to 4 flights, each with its own cities and week: the first is from/to/departWeek, the rest `extraLegs`). A multi-city trip is NOT a new backend feature: `legQueries()` (src/lib/legs.ts) turns it into one one-way search per flight, run one after another by `MultiResultsPage` (so Groq's per-minute limit isn't hit), each costing one regular search and about 3 SerpApi credits. The URL carries `trip` and `leg2..leg4` as `FROM-TO-YYYY-Www`; older links without `trip` still work.
3. **Accounts are required to search.** Gate order: signed in -> phone on file (collected, NOT verified) -> email verified. Email is verified with a 6-digit code we email through Brevo (`api/email-code/*`, rules in `api/_lib/emailCodeLogic.ts`: 10 min expiry, 5 wrong tries, 1 send/min, 5 sends/hour, only an HMAC of the code is stored). Google/magic-link accounts arrive already verified. Signed-out users get a fixed demo at `/demo` (no API calls).
4. **Limits (server-side, one Firestore transaction):** per user per day: 4 regular + 1 deep (`DAILY_REGULAR_LIMIT`, `DAILY_DEEP_LIMIT`; stored as `count` and `deepCount` on the usage doc); 15/IP/day and 300 global/day count both kinds. Same search within 6h is cached and free. Quota is refunded if our side fails or nothing is found.
5. **The LLM never invents data.** Fares come from the provider; `scoring.ts` precomputes every comparison; `groq.ts` rejects answers with unknown ids, reused badges, or any `$` amount that isn't a real price, a given difference, or the difference between two picks. Badges and warnings are computed from the data in `pipeline.ts` (`decorate`), never taken from the model, and an answer is rejected if it calls a pick nonstop/direct when it has stops in every direction. Models: a regular search uses `GROQ_MODEL` (default `openai/gpt-oss-20b`, low reasoning, 10 candidates); a Deep Search uses `GROQ_DEEP_MODEL` (default `openai/gpt-oss-120b`, medium reasoning, 12 candidates, fuller trade-off explanations). Call budget: at most 2 requests: a bad answer gets one more try on the SAME model with the reason (so regular stays cheap); if the model is down or rate limited the other one tries; a request Groq rejects outright (400/401) is never repeated. Deep and regular results are cached separately (`depth` is in the cache key and the URL). Only gpt-oss-20b/120b and qwen3.8-27b support Groq's strict JSON mode. If both fail the result is a deterministic ranking (`aiFallback`), which is NOT cached and does NOT count against the user's daily searches. Groq's free tier allows about 8k tokens/minute per model, so prompts stay small (10 candidates).
6. flexfare doesn't sell tickets, but it is an alternative to a search site, not a feeder: each route has **Booking options** (`src/shared/booking.ts`, `airlines.ts`): the airline itself first and recommended, then Google Flights, Skyscanner, Expedia, Kayak (and Aviasales when we have a fare link). Airline deep links exist only for airlines whose URL formats were checked in a real browser on 2026-10-02 (Alaska, United (`tt=0` round trip / `tt=1` one way), American, JetBlue, Delta (fills the form, click Find Flights)); about 45 more airlines open their own site and the panel prints the trip to enter. Never add a deep link without opening it in a browser first. Fares are estimates.
7. **More options:** the AI writes up the top picks (`tier: 'pick'`); the rest of the priced flights (10 regular, 15 deep) follow as `tier: 'more'`, ranked by score with templated text and badges computed from the data. Only the best 10/12 are sent to the AI (Groq token limits).

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

- Fare sources (`api/_lib/providers/`): `serpapi.ts` (live Google Flights; 1 credit per search, prices ONE day combination per search so `pairs.ts` picks the 3 (5 deep) best-fitting combinations; 24h shared cache in Firestore `serpFares`; monthly credit cap in `serpCredits.ts`; return-leg details are not known, so `stopsBack`/`minutesBack` are null and the UI sends people to Google Flights to pick the return), `travelpayouts.ts` (verified against the real API: works, but its cache is too thin for week searches: ~1 fare for SFO-LIS across two months), `simulated.ts`. The serpapi provider is tested against a SerpApi-shaped fixture, not yet against a real key.
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
