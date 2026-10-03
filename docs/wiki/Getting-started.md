# Getting started

You need Node 22 or newer.

```bash
git clone https://github.com/shankar-sachin/flexfare.git
cd flexfare
npm install
cp .env.example .env
npm run dev
```

`npm run dev` runs the front end only. The home page, the sample search at `/demo` and most UI work need no keys.

To work on sign-in, search or anything in `api/`, fill in `.env` (see [Environment variables](Environment-variables)) and run:

```bash
npm run dev:full
```

That starts the front end and the API together through `vercel dev`. With `FARE_PROVIDER=simulated` you don't need a fare-data key.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

CI runs these plus `npm audit --audit-level=high` on every pull request.
