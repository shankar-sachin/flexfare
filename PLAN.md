# flexfare: full build plan (hand-off to Sonnet 5.5)

## Context

`~/Downloads/flexfare.zip` holds a working **front-end prototype**: Vite + React 18 + TS strict + react-router v6 and a finished design system. The pages are Search, Results and Route detail. All data is mocked (`src/lib/mockData.ts`), and `src/lib/api.ts::curateRoutes()` is the one seam where a backend plugs in. The product idea is **city → city and week → week**. Users pick a leave week and a return week, every day in both weeks is checked, and an AI ranks the results and explains its picks in plain language.

This plan turns the prototype into a real product:
- **Accounts are required to search.** Firebase Auth supports email+password, Google and magic link, and **every account must have a verified email** before it can search (Google and magic-link accounts are verified automatically; email+password accounts click a verification link). A **phone number is also required at sign-up but is NOT verified** (no SMS is sent, since no free SMS service exists). It is a speed bump, not real protection; see "Abuse protection" below. Free tier only, with **5 AI searches per day**.
- **Signed-out visitors get a fixed demo.** It shows real UI with sample data, and they can't choose anything.
- **Real fares, found but not sold.** flexfare is only a bridge. It finds the best flights and hands off to Google Flights, Aviasales or Skyscanner to book. There is no checkout and no payments.
- **Groq analyzes the candidates.** It ranks them and writes the explanations. The Groq key stays server-side and is read from `.env`.
- **Everything runs on free tiers** where possible. Nothing in this plan needs a paid plan or billing details.

### Decisions made (with reasons)
| Area | Choice | Why |
|---|---|---|
| Fare data | **Travelpayouts / Aviasales Data API** (primary) and a **Simulated** provider (dev/demo/fallback), both behind a `FareProvider` interface | Free with an affiliate token and no booking requirement. Prices are cached from real Aviasales searches (kept up to 7 days). It returns price, airline, flight no., transfers, durations and a deep link. Duffel bills "excess searches" when you never book, and SerpApi's free tier is about 100/month. Scraping Google Flights breaks its ToS, gets blocked, and can't run headless on free serverless. |
| Backend | **Vercel serverless functions** (`/api/*.ts`) in the same repo, on the Vercel Hobby plan (free) | Keeps the Vite app. Firebase Cloud Functions would need the paid Blaze plan just to call Groq. |
| Database | **Firestore** (free Spark quota) through `firebase-admin` on the server | Holds usage counters, the cache and search history |
| LLM | Groq `openai/gpt-oss-120b` with structured outputs (JSON schema). Fallback: `llama-3.3-70b-versatile` in JSON mode | Fast, cheap or free, OpenAI-compatible. Call it with plain `fetch`, so no SDK is needed. |
| Quota | 5 curation runs per user per UTC day, enforced on the server. Cache hits (the same query within 6h) are free. | Your choice |

### Why the phone number is collected but not verified
Vercel has no SMS product, and Firebase phone auth requires the paid Blaze plan (about $0.01-0.06 per SMS after ~10 free a day). Twilio Verify's trial only texts pre-verified numbers. So there is no reliable free SMS option, so the number is **collected but not verified**. It deters casual multi-accounting (people must type a number, and each number can be used by only one account), but anyone can type a made-up number, so the other measures below do the real work. If the app grows and needs a hard one-account-per-person rule, SMS verification can be added later behind the same guard (the `phoneOnFile` claim would become `phoneVerified`).

### Abuse protection (all free)
0. **Phone number required (unverified).** After email verification, users must enter a phone number on `/add-phone` before searching.
   - Client and server validate E.164 (`/^\+[1-9]\d{7,14}$/`) and reject obviously fake numbers (all the same digit, runs like 1234567, `555-01xx` style fiction ranges).
   - The server stores only an **HMAC-SHA256 hash** of the number (key `PHONE_HASH_SECRET`), never the raw number, in `phones/{hash}` = `{ uid }`, written in a Firestore transaction so **one number can belong to only one account**. Reusing a number returns 409 `PHONE_IN_USE` ("That number is already on another flexfare account.").
   - On success the server sets a custom claim `phoneOnFile: true` (`admin.auth().setCustomUserClaims`), and the client calls `getIdToken(true)` to refresh it. Other endpoints then check the claim, with no extra database read per request.
   - UI copy is honest: "We ask for a phone number to keep free accounts fair. We don't text you and we don't share it." No SMS code step.
1. **Verified email required.** `/api/*` returns 403 `EMAIL_UNVERIFIED` unless the ID token has `email_verified: true`.
2. **Per-IP daily cap.** Quota is also counted per hashed IP (`sha256(ip + DAILY_SALT)`) in Firestore: `IP_DAILY_LIMIT` (default 15) curation runs per IP per UTC day, so many accounts from one connection don't help.
3. **Global daily circuit breaker.** `GLOBAL_DAILY_LIMIT` (default 300) uncached curation runs per UTC day across all users. When it's hit, return 503 `BUSY` with "flexfare is at capacity today, try again tomorrow." This protects the Groq quota and the Travelpayouts rate limits.
4. **Disposable-email blocklist.** A small static list (about 100 domains) in `api/_lib/disposable.ts`, checked at sign-up on the client and again on the server.
5. **Firebase App Check with reCAPTCHA v3** (free) is an optional hardening step once deployed.
6. Cache hits (same query within 6h) cost nothing, which also reduces how much abuse can achieve.

---

## Ground rules for the builder (Sonnet)
1. **No package installs without asking the user first.** This is the user's global rule: ask before each `npm install`, `npm i -g`, `brew`, `pip` and so on, and wait for a yes to that exact command. Packages this plan needs are listed in Phase 0. Ask for them one command at a time.
2. Keep every design rule in the prototype's `CLAUDE.md`. These include the palette, yellow used only as a fill, Archivo + IBM Plex Mono, touch targets ≥44px, working at 390px wide, plain copy with no emoji, and fares always labelled as estimates.
3. Never put secrets in `VITE_*` variables. Only the Firebase **web** config is public.
4. The LLM **never invents fares**. Every price, date, airline and duration shown comes from provider data. The LLM only picks candidate IDs, assigns fit, badges and scores, and writes text.

---

## Phase 0: Project setup
- Extract the zip so its contents land directly in `/Users/sachi/Master_Coding/flexfare/`. The zip has a nested `flexfare/` folder, so flatten it. Delete `tsconfig.tsbuildinfo`, then `git init`.
- Ask the user before running each of these:
  - `npm install` (existing lockfile)
  - `npm install firebase zod`
  - `npm install -D firebase-admin @vercel/node vitest @testing-library/react @testing-library/jest-dom jsdom`
    (`firebase-admin` is used only by `/api`, and Vercel bundles it. Putting it in `dependencies` is also fine.)
  - `npm install -g vercel` (for `vercel dev` locally). The other option is `npx vercel dev`, which still downloads the package, so ask either way.
- Add `.env.example` and add `.env` and `.env.local` to `.gitignore`:
  ```
  # public (browser)
  VITE_FIREBASE_API_KEY=
  VITE_FIREBASE_AUTH_DOMAIN=
  VITE_FIREBASE_PROJECT_ID=
  VITE_FIREBASE_APP_ID=
  # server only
  GROQ_API_KEY=
  GROQ_MODEL=openai/gpt-oss-120b
  TRAVELPAYOUTS_TOKEN=
  TRAVELPAYOUTS_MARKER=
  FARE_PROVIDER=travelpayouts        # travelpayouts | simulated
  FIREBASE_SERVICE_ACCOUNT_B64=      # base64 of the service-account JSON
  DAILY_SEARCH_LIMIT=5
  IP_DAILY_LIMIT=15
  GLOBAL_DAILY_LIMIT=300
  DAILY_SALT=                        # random string for IP hashing
  PHONE_HASH_SECRET=                 # random string, HMAC key for phone hashes
  ```
- Add `vercel.json`: an SPA rewrite (everything except `/api/*` → `/index.html`) and `functions: { "api/**/*.ts": { "maxDuration": 60 } }`.
- Scripts: `"dev": "vercel dev"`, `"dev:web": "vite"`, `"test": "vitest"`, and keep `build` and `typecheck`. Add `api/` to a second tsconfig (`tsconfig.api.json`, Node types) and reference it from `tsc -b`.
- One-time user setup steps go in the README: create the Firebase project, enable the Email/Password (with Email link) and Google providers, add authorized domains (localhost and the Vercel domain), create Firestore, generate a service account key, and sign up at travelpayouts.com for the token and marker.

## Final layout
```
api/                          Vercel functions (Node runtime)
  curate.ts                   POST: the AI curation pipeline (costs 1 quota unless cached)
  week-fares.ts               GET: lowest fare per upcoming week for from/to (free, cached 12h)
  places.ts                   GET: city autocomplete proxy (free, cached)
  add-phone.ts                POST: { phone } -> validate, hash, claim uniqueness, set phoneOnFile claim
  me.ts                       GET: { searchesLeftToday, limit, emailVerified, recentSearches }
  _lib/
    auth.ts                   verifyRequest(req): Firebase ID token → { uid, email }; 401/403
    firestore.ts              firebase-admin init from FIREBASE_SERVICE_ACCOUNT_B64
    quota.ts                  consumeQuota(uid, ipHash): per-user, per-IP and global limits in one Firestore transaction; peekQuota(uid)
    disposable.ts             disposable-email domain blocklist
    phone.ts                  normalizePhone(), isFakeLooking(), hashPhone()
    cache.ts                  get/set by sha256(normalized query), TTL
    validate.ts               zod schemas for the request bodies
    providers/
      types.ts                FareProvider, FareCandidate
      travelpayouts.ts        real provider
      simulated.ts            deterministic, seeded by route+date (dev/tests)
      index.ts                getProvider() from FARE_PROVIDER
    scoring.ts                deterministic pre-score + "facts" (price diffs etc.)
    groq.ts                   callGroq(): schema, retry, model fallback
    prompt.ts                 system prompt + candidate serializer
    curate.ts                 orchestrates the pipeline → CurationResult
    links.ts                  Google Flights / Skyscanner / Aviasales deep links
    nearby.ts                 curated nearby-airport table (LIS→OPO, etc.)
src/
  shared/types.ts             moved from src/lib/types.ts; imported by api/ and src/
  shared/weeks.ts             moved from src/lib/weeks.ts (pure, used by both sides)
  lib/
    firebase.ts               client init (VITE_ env)
    AuthContext.tsx           user, loading, emailVerified, getToken()
    api.ts                    authed fetch wrapper: curate(), weekFares(), places(), me()
    useCuration.ts            reads query from the URL; handles quota and no-data errors
    queryUrl.ts               SearchQuery ⇄ URLSearchParams
    SearchContext.tsx         keeps the form state; initialised from the URL
  demo/
    demoResult.ts             mockCuration moved here (fixed SF→Lisbon demo)
    DemoBanner.tsx
  components/                 existing ones, plus CityAutocomplete, UserMenu, QuotaPill,
                              FindLinks, RequireAuth, RequireVerifiedEmail, RequirePhoneOnFile, PhoneField, AuthCard, VerifyEmailNotice
  pages/
    LandingPage.tsx           signed-out home: hero, read-only demo form, "See the demo"
    DemoResultsPage.tsx       /demo (wraps ResultsPage in demo mode)
    SearchPage.tsx            /search (signed-in, interactive)
    ResultsPage.tsx           /results?…
    RoutePage.tsx             /route/:id?… and /demo/route/:id
    SignUpPage.tsx  SignInPage.tsx  FinishEmailLinkPage.tsx  VerifyEmailPage.tsx  AddPhonePage.tsx
    AccountPage.tsx           usage today, recent searches, sign out, delete account
firestore.rules
```

## Routes and access
| Path | Who | Notes |
|---|---|---|
| `/` | everyone | Signed-out: landing + demo teaser. Signed in and verified: redirect to `/search`. |
| `/demo`, `/demo/route/:id` | everyone | Fixed demo. Every control is disabled, with a "Sign up free to pick your own weeks" CTA. |
| `/signup`, `/signin` | signed-out | Email+password, Google, magic link |
| `/auth/finish` | anyone | Completes the magic link (`isSignInWithEmailLink`). Asks for the email again if `localStorage` lost it. |
| `/verify-email` | signed-in, unverified | "Check your inbox" page with Resend (rate-limited to once a minute) and "I've verified" (calls `user.reload()`) |
| `/add-phone` | signed in, email verified | Required, unverified phone number (country select + number). Skipped if the `phoneOnFile` claim is set. |
| `/search`, `/results`, `/route/:id`, `/account` | signed in, email verified **and** phone on file | `RequireAuth` → `RequireVerifiedEmail` → `RequirePhoneOnFile` guards |

Results state lives in the URL so links can be shared and reloaded: `/results?from=SFO&to=LIS&out=2026-W43&back=2026-W45&stay=range&prio=balance&pax=1&cabin=economy`. `from` and `to` are IATA **city** codes (SFO, NYC, LON, TYO…). `back` is left out for one-way.

## Phase 1: Shared types and refactors
- Move `types.ts` and `weeks.ts` to `src/shared/`. Add `parseIsoWeek("2026-W43") → Week` and `formatIsoWeek(week)`.
- `City` comes from autocomplete now: `{ code: string /*IATA city*/, name, country, airports: string[], nearby? }`. Replace the hardcoded `CITIES` list with a small `POPULAR_CITIES` seed for empty-state suggestions.
- Type changes in `CuratedRoute`:
  - Rename `bookingUrl` → `links: { googleFlights: string; skyscanner: string; aviasales?: string }`
  - Make `Leg.segments` optional, because Travelpayouts gives a summary, not segments. Add `Leg.stops: number`, `Leg.departAt?: string`, `Leg.arriveAt?: string`.
  - Add `priceFoundAt: string` (ISO) so the UI can say "fare seen 3h ago".
- `CurationResult` gains `aiFallback: boolean`, `quota: { used: number; limit: number }` and `dataNote?: string`. `dataNote` covers cases like "Few fares cached for these weeks; check the links for live prices."
- Update `Itinerary.tsx` so that a leg without segments renders a summary row (`OAK → LIS · 1 stop · 14h 40m`) plus "See exact flights" links.
- Remove `combosChecked` mock math. The server reports the real count.

## Phase 2: Auth (Firebase) and email gate
- `src/lib/firebase.ts`: `initializeApp` + `getAuth`. No client-side Firestore is needed (the server owns all data), which keeps the rules simple.
- `AuthContext`: `onIdTokenChanged`. `emailVerified = user.emailVerified`. `getToken()` returns `user.getIdToken()`.
- Sign-up and sign-in pages each have one `AuthCard`, with these methods:
  - Email + password: `createUserWithEmailAndPassword` + `sendEmailVerification` (sent, not blocking). Also a "Forgot password" link (`sendPasswordResetEmail`).
  - Google: `signInWithPopup(GoogleAuthProvider)`, falling back to redirect on mobile Safari.
  - Magic link: `sendSignInLinkToEmail(email, { url: origin + '/auth/finish', handleCodeInApp: true })`. Store the email in localStorage.
- `/verify-email`: shown to email+password users until `user.emailVerified`. Resend button calls `sendEmailVerification` (cooldown 60s). "I've verified" calls `user.reload()` then `getIdToken(true)` so the `email_verified` claim refreshes, then goes to `/search`. Google and magic-link users skip it.
- `/add-phone` (`PhoneField`): country-code select + number input, normalised to E.164, with a plain-language note that no text is sent. Submit → `POST /api/add-phone` → `getIdToken(true)` → `/search`. Map `PHONE_IN_USE` and `INVALID_PHONE` to friendly errors.
- Block disposable-email domains on the sign-up form (`disposable.ts` list shared with the server) with the message "Please use a permanent email address."
- Header: when signed out, show "Sign in" + yellow "Sign up free". When signed in, show `UserMenu` (avatar initial, `QuotaPill` "4 of 5 searches left today", Account, Sign out). Remove the "Watchlist" link (out of scope).

## Phase 3: Backend pipeline
### `api/_lib/auth.ts`
Read `Authorization: Bearer <idToken>` → `admin.auth().verifyIdToken(token, true)`. If it's missing or invalid, return 401. If `decoded.email_verified` is false, return 403 `{ code: 'EMAIL_UNVERIFIED' }`. If the `phoneOnFile` claim is missing (except on `/api/add-phone` itself), return 403 `{ code: 'PHONE_REQUIRED' }`.

### FareProvider
```ts
interface FareCandidate {
  id: string;                     // stable hash of origin|dest|out|back|airline|flightNo
  originAirport: string; destAirport: string; destCityCode: string; isNearby: boolean;
  outDate: string; backDate: string | null;
  price: number;                  // USD, round trip for 1 adult
  airline: string;                // IATA code; map to name via airlines.json (cached)
  flightNumber?: string;
  stopsOut: number; stopsBack: number | null;
  minutesOut: number; minutesBack: number | null;
  departAt?: string; returnAt?: string;
  deepLink?: string;              // aviasales path
  foundAt: string;
}
interface FareProvider {
  searchWeeks(q: NormalizedQuery): Promise<{ candidates: FareCandidate[]; pairsChecked: number }>;
  weekLows(fromCity: string, toCity: string, weeks: Week[]): Promise<WeekFare[]>;
}
```
**Travelpayouts provider.** Check the exact parameter names against the official docs while building: https://support.travelpayouts.com/hc/en-us/articles/203956163
- **Week grid**: `GET https://api.travelpayouts.com/v2/prices/week-matrix?origin=SFO&destination=LIS&depart_date=<Thu of leave week>&return_date=<Thu of return week>&currency=usd&show_to_affiliates=true`. It returns prices for ±3 days around each date, so centring on Thursday covers the whole Mon–Sun window and up to all 49 pairs in one call.
- **Details per promising date pair**: `GET /aviasales/v3/prices_for_dates?origin=&destination=&departure_at=YYYY-MM-DD&return_at=YYYY-MM-DD&currency=usd&sorting=price&limit=10&unique=false`. This gives airline, flight number, transfers, `duration_to` and `duration_back`, `link`, and `origin_airport`/`destination_airport`. Call it for the ~12 cheapest pairs from the matrix only. Run them in parallel with a small concurrency limiter (4 at a time, 8s timeout each).
- Run the whole thing for the destination city code **and** each `nearby` airport (from `nearby.ts`). Searching by city code already covers all of the city's airports, and the `origin_airport` field tells you which one each fare uses.
- If there's too little data (fewer than 3 candidates), widen the search: try `departure_at=YYYY-MM` (month) and filter to the weeks. If it's still empty, return `routes: []` with a `dataNote` and week-level Google Flights links. **Never invent fares.**
- `weekLows`: run `prices_for_dates` at month granularity for the months the 12 upcoming weeks cover, then take the minimum price per ISO week.
- Token goes in the `X-Access-Token` header. Prices are always requested with `currency=usd`.
- Autocomplete (`api/places.ts`): `GET https://autocomplete.travelpayouts.com/places2?term=<q>&locale=en&types[]=city` (free, no token). Map each result to `City`. Use edge cache (`Cache-Control: s-maxage=86400`).

**Simulated provider.** Deterministic fares seeded by `hash(route+date)`, with realistic weekday patterns (Tue/Wed are cheapest). It's used when `FARE_PROVIDER=simulated` and in tests. The results page shows a "Sample data" tag whenever this provider is active.

### Scoring (`scoring.ts`): deterministic, done before the LLM sees anything
- `priceScore = 100 * minPrice / price`.
- `timeScore = 100 * minMinutes / minutes` (average of the out and back trips).
- `connScore = 100 / 85 / 65 / 45` for 0, 1, 2 and 3+ stops (averaged over both directions). Subtract 10 if `isNearby`.
- `stayScore` depends on `StayPreference`:
  - `cheapest` → 100 for everything
  - `range` (10–16 nights) → 100 inside the range, minus 8 per night outside it
  - `about-two-weeks` → 100 − 7·|nights − 14|
  - `exact` → 100 only if the dates are inside the exact weeks picked (always true)
- Weights by `Priority`: `price` {p .55, t .15, c .15, s .15}; `balance` {.35, .25, .2, .2}; `speed` {.15, .45, .25, .15}.
- Dedupe (same airports, dates and airline, keeping the cheapest). Keep the **top 15** by pre-score for the LLM.
- Precompute **facts** so the LLM never does arithmetic: the cheapest overall, the fastest, a nonstop if one exists, and for each candidate `deltaVsCheapest`, `deltaVsNonstop`, `minutesVsFastest`, `nights` and `weekday`.

### Groq (`groq.ts`, `prompt.ts`)
- `POST https://api.groq.com/openai/v1/chat/completions` with `model: GROQ_MODEL`, `temperature: 0.3`, and `response_format: { type: 'json_schema', json_schema: { name: 'curation', strict: true, schema } }`.
- System prompt: "You are flexfare's route analyst." Rules: rank only the given candidates. Use only numbers that appear in `facts`. Write in a plain, specific style ("$123 cheaper, 3½ hours longer"), with no hype and no emoji. Say what the trade-off is. Lowercase isn't required. Prices are estimates.
- User message: compact JSON of the query preferences + the 15 candidates (IDs, facts, scores) + destination nearby info (e.g., "OPO is a 2h 50m train from Lisbon").
- Output schema (validate again with zod):
  ```
  { headline: string (≤140), summary: string (≤320),
    picks: [{ candidateId, fit: 0-100, badge?: 'Best fit'|'Fastest'|'Lowest fare'|'Nearby arrival',
              warning?: string(≤30), why: string(≤220), reasons: string[2..4],
              scores: { price, travelTime, connections, weeksFit } }]  // 3–5 picks
  }
  ```
- Server checks after the call: each `candidateId` must exist, each badge can appear only once, and fit must be clamped. If validation fails, retry once with the error appended. If it fails again, try the fallback model. If that fails too, use a **deterministic fallback**: top 5 by pre-score, badges from the facts, and template-written `why` text, with `aiFallback: true` (the UI shows "AI summary unavailable, ranked by score").
- Picks with no reasons get template reasons.

### `curate.ts` orchestration (`POST /api/curate`)
1. `verifyRequest`, then validate the body with zod (`from`/`to` must match `/^[A-Z]{3}$/` and be different; weeks must be ISO weeks within the next 12; `back` must be after `out` and within 8 weeks of it; `pax` 1–9; `cabin` enum. Cabin is passed to the links only, because Travelpayouts is economy-focused, and the UI says so).
2. `key = sha256(normalizedQuery)`. On a cache hit younger than 6h, return it with the current quota and **don't** spend quota.
3. `consumeQuota(uid)`: a Firestore transaction on `usage/{uid}_{YYYY-MM-DD}` (UTC). If `count >= limit` → 429 `{ code: 'QUOTA_EXCEEDED', resetsAt }`. Otherwise increment it. If the pipeline later throws a 5xx, refund the quota (decrement).
4. provider.searchWeeks → scoring → Groq → merge into `CuratedRoute[]`. Each `outDayFares`/`backDayFares` row comes from the week-matrix minimum per day, for the same origin and destination airport (`delta` = $ over that week's cheapest). `links` come from `links.ts`:
   - Google Flights: `https://www.google.com/travel/flights?q=` + encode(`Flights from OAK to LIS on 2026-10-20 through 2026-11-01`)
   - Skyscanner: `https://www.skyscanner.com/transport/flights/oak/lis/261020/261101/?adultsv2=1&cabinclass=economy`
   - Aviasales: `https://www.aviasales.com` + `link` + `&marker=TRAVELPAYOUTS_MARKER`
5. Add `weekFares` (`weekLows`, cached 12h per city pair), `combosChecked = pairsChecked`, the quota and `dataNote`.
6. Write the cache doc and `searches/{uid}/items/{autoId}` = `{ query, headline, topPrice, createdAt }` (no full result, to keep things small). Return the result.

### Other endpoints
- `GET /api/week-fares?from&to`: authed but doesn't use quota. Returns `WeekFare[]` for the 12 upcoming weeks. Powers the "from $X" bars on `/search`.
- `GET /api/me` → `{ limit, usedToday, resetsAt, recent: last 10 searches }`.

### Firestore
- Collections: `usage/{uid}_{date}` `{ count, uid, date }`, `phones/{hmac}` `{ uid }`, `cache/{hash}` `{ result, createdAt }`, `weekLows/{from_to}` `{ fares, createdAt }`, and `searches/{uid}/items/*`.
- `firestore.rules`: deny all client reads and writes (`allow read, write: if false;`), because only the Admin SDK touches data. Deploy with the Firebase console's rules editor, so the firebase CLI isn't needed.
- TTL: set a Firestore TTL policy on `cache.createdAt` and `usage` (console, free) or ignore stale docs on read.

## Phase 4: Front-end wiring
- `src/lib/api.ts`: `authedFetch(path, init)` adds the bearer token and maps errors to typed `ApiError` codes (`EMAIL_UNVERIFIED` → navigate to `/verify-email`; `PHONE_REQUIRED` → `/add-phone`; `QUOTA_EXCEEDED`; `BUSY`; `NO_DATA`; `NETWORK`). Keep the in-memory per-query promise cache that already exists.
- `useCuration(query, { demo })`: in demo mode it returns `demoResult` synchronously. Otherwise it calls `/api/curate`. It runs only when the URL query is valid.
- `SearchPage` (signed in):
  - Replace the `<select>` in `CityField` with `CityAutocomplete` (debounced 200ms → `/api/places`, keyboard-navigable combobox, ARIA `role=combobox`/`listbox`). Under the field, show the airports the city expands to, as it does today.
  - Add a Travelers/cabin popover (1–9 adults; cabin only affects deep links).
  - `WeekPicker` fares come from `/api/week-fares` (skeleton bars while loading).
  - The CTA "Curate my routes" pushes `/results?…`. Under it, show "Uses 1 of your 4 remaining searches today", or a disabled state with the reset time when the quota is used up.
- `ResultsPage`:
  - Reads the query from the URL.
  - Loading state with a step list ("Checking 49 date pairs across SFO, OAK, SJC…", then "Ranking with AI…").
  - Error states in plain copy: quota exceeded (shows reset time + "your recent searches are free to reopen"), no data (`dataNote` + week-level FindLinks), and a generic retry.
  - Tags for "Sample data" and `aiFallback`.
  - Remove the "Watch" CTA (no watchlist yet), or replace it with "Share these results" (copies the URL).
- `RoutePage`: the price card gets **"Find this flight"** buttons (Google Flights in yellow, then Skyscanner and Aviasales as ghost buttons) built from the selected day pair. When the day picker changes dates, rebuild the links with the new dates. Copy: "flexfare doesn't sell tickets. Prices are estimates seen {foundAt ago}; the airline sets the final price."
- `AccountPage`: quota today, recent searches (click to reopen, which is a cache hit and free if it's under 6h old), email, sign out, and delete account (`user.delete()` + server cleanup of `searches`; confirm dialog).

## Phase 5: Demo mode (signed out)
- Move `mockCuration` and the old `CITIES` into `src/demo/`. Use a fixed SF → Lisbon query with weeks computed relative to today (via `upcomingWeeks`), so the dates always look current. Mark it `demo: true` and set `links` to `#` (disabled).
- `LandingPage` shows the existing hero and "how it works", plus the search form rendered **read-only**. That means every input and button is `disabled`/`aria-disabled`, with a lock hint "Sign up free to choose your own cities and weeks". It has two CTAs: "See a sample search" → `/demo` and "Sign up free" → `/signup`.
- `/demo` reuses `ResultsPage` with `demo` mode: the sort control still works (that's harmless), there's a `DemoBanner` at the top, "Edit search" becomes "Sign up to search", and route links go to `/demo/route/:id`. On `RoutePage` in demo mode the day picker is shown but disabled, and the Find buttons become "Sign up to find this flight".
- No network calls in demo mode.

## Phase 6: Hardening, tests, deploy
- **Tests (Vitest)**:
  - `shared/weeks.ts` (ISO week edge cases: week 53, the year boundary, `parseIsoWeek` round-trip)
  - `queryUrl.ts` round-trip
  - `scoring.ts` (weights, stay preferences, dedupe, facts)
  - Groq output validation + the deterministic fallback (with a mocked fetch)
  - Travelpayouts normalisation against saved fixture JSON in `api/_lib/providers/__fixtures__/`
  - `WeekPicker` range logic (Testing Library)
  - `RequireVerifiedEmail` and `RequirePhoneOnFile` redirects
  - `phone.ts` (E.164 normalisation, fake-number rejection, stable hash)
  - `quota.ts` (user, IP and global limits, refund on 5xx)
- **Security checklist**:
  - Every `/api` route verifies the ID token.
  - Verified email and a phone on file are required for curate, week-fares and me.
  - Raw phone numbers are never stored or logged.
  - Per-user, per-IP and global limits all enforced server-side.
  - Zod validates all inputs.
  - No secrets in `VITE_` vars.
  - Firestore is deny-all to clients.
  - Error responses don't leak provider or Groq errors (log them on the server only).
  - Basic per-IP throttle on `/api/places` (in-memory is fine).
- **Accessibility and responsiveness**: keep the existing rules. Check 390px wide on every new page, and test keyboard flow through autocomplete and the sign-up form.
- **Deploy**: `vercel` (link the project) → add all `.env` vars in the Vercel dashboard → add the Vercel domain to Firebase authorized domains → `vercel --prod`.
- Update `CLAUDE.md` and `README.md` to cover the new architecture, env vars, the one-time Firebase and Travelpayouts setup.

## Verification (end-to-end)
1. `npm run typecheck && npm test` pass.
2. Run `FARE_PROVIDER=simulated` + `vercel dev`, then go through these in order:
   - signed-out `/` shows the read-only form, and `/demo` + `/demo/route/:id` work with zero network calls (check the Network tab)
   - sign up with email → redirected to `/verify-email` → click the emailed link → `/add-phone` → enter a number → land on `/search`. Re-using the same number on a second account is rejected.
   - pick cities and weeks → results come back with Groq text, and the `/api/me` quota drops by 1
   - reload the same results URL → served from cache, and the quota doesn't change
   - run 5 different searches → the 6th returns the quota-exceeded state
3. Same as step 2 with Google sign-in and with a magic link (check the `/auth/finish` flow in a fresh tab).
4. Switch to `FARE_PROVIDER=travelpayouts` with a real token. Search a busy route (NYC → LON) and a thin one, and check that the real prices, the no-data note and the Google Flights / Skyscanner links open with the right airports and dates.
5. Break `GROQ_API_KEY` on purpose → results still render with `aiFallback` and the quota is refunded only on 5xx.
6. Call `/api/curate` with curl without a token → 401. With a token for an unverified-email user → 403 `EMAIL_UNVERIFIED`. With a verified user but no phone → 403 `PHONE_REQUIRED`.
7. Check the 390px mobile layout on landing, sign-up, verify-email, add-phone, search, results and route pages.
