# Architecture

| Layer | Tech |
|---|---|
| Front end | Vite, React 18, TypeScript (strict), react-router 7, plain CSS tokens |
| API | Vercel serverless functions in `api/` (Web `Request`/`Response`) |
| Auth | Firebase Auth in the browser, `firebase-admin` on the server |
| Data | Firestore, server only (rules deny every client) |
| AI | Groq: `gpt-oss-20b` (regular), `gpt-oss-120b` (deep) |
| Fares | SerpApi (Google Flights data), Travelpayouts, or a simulated provider |
| Email | Brevo transactional email for the 6-digit verification code |
| Tests | Vitest, Testing Library, jsdom |

## Where things live

```
api/                 curate, week-fares, me, add-phone, email-code/*
  _lib/              auth, quota, cache, scoring, prompt, groq, pipeline, providers/
src/shared/          code used by both sides: types, weeks, booking links, metro airports
src/lib/             auth context, API client, URL state, calendar and city search
src/components/      search form, calendar, results, booking panel, home sections
src/pages/           Landing, Search, Results, Route, Auth, Verify, Account
```

Results state lives in the URL so any search can be shared or reloaded.

## Rules worth knowing

- `firebase-admin` is pinned to 13.x. Version 14 crashes the functions on Vercel.
- The AI never invents data. Anything numeric comes from the provider or from `scoring.ts`.
- Fares are estimates until checkout.
