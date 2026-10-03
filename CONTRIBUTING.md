# Contributing to flexfare

Thanks for helping. The short version:

1. **Make your own branch** (fork the repo first if you don't have write access).
2. **Make your change** and run the checks below.
3. **Open a pull request.** I'll review it.

Nothing goes straight into `main`. Every change, including mine, comes in through a pull request.

## Set up

You need Node 22 or newer.

```bash
git clone https://github.com/shankar-sachin/flexfare.git
cd flexfare
npm install
cp .env.example .env
npm run dev
```

`npm run dev` starts the front end only. The home page, the sample search at `/demo` and most UI work need no keys at all. To work on sign-in, search or anything in `api/`, fill in `.env` (the README lists where each key comes from) and run `npm run dev:full`. With `FARE_PROVIDER=simulated` you don't need a fare-data key.

## Branch names

Use a short prefix so it's clear what a branch is for: `feat/` for features, `fix/` for bug fixes, `docs/` for documentation, `ci/` for workflow changes. For example `fix/week-calendar-focus`.

## Before you open the PR

Run the same checks CI runs. All four should pass:

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

## The pull request

- **Keep it focused.** One change per PR is much easier to review than several.
- **Say what and why**, and **how you checked it**. The PR template has the prompts.
- **For anything visual, look at it in a browser**, including at about 390px wide (phone width), and include a screenshot.
- If I ask for changes, push to the same branch and the PR updates.
- Merge conflicts: if `main` moved on, merge it into your branch (or tell me and I'll help).

## Ground rules

- **No secrets, ever.** `.env` is gitignored; keep it that way. If you accidentally commit a key, tell me right away (privately, see [SECURITY.md](SECURITY.md)) so it can be replaced.
- **Add a test for new behaviour,** and fix the code rather than weakening a test to make it pass.
- **The AI never supplies numbers.** Prices, dates and airlines come from the fare source, and anything the AI writes is checked against them. See `CLAUDE.md` for the details before touching `api/_lib/groq.ts` or `pipeline.ts`.
- **Don't add airline or booking links you haven't opened.** Booking-link formats change and many sites ignore unknown parameters, so each pre-filled link was opened in a real browser first. Add a test with the exact format.
- **Be careful with dependencies.** Say why a new one is needed, and keep `npm audit` clean. `firebase-admin` is pinned to version 13: version 14 crashes every API function on Vercel.
- **Follow the design rules** in `CLAUDE.md` (palette, type, 44px tap targets, plain copy, no emoji, fares labelled as estimates).

## Bugs and ideas

Open an [issue](https://github.com/shankar-sachin/flexfare/issues/new/choose). For anything security-related, don't use a public issue: follow [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the same as the rest of the project.
