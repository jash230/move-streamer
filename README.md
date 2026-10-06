# Cucuflix

A React + Vite site for browsing movies and TV shows (including Israeli series) with embedded players.

- **Metadata:** [TMDB](https://www.themoviedb.org/) (titles, posters, seasons, episodes)
- **Players:** Videasy (default, no pop-ups) and VidSrc (backup, may show pop-ups)

## Setup

```bash
npm install
cp .env.example .env.local   # then add your free TMDB key
npm run dev
```

Get a TMDB key at https://www.themoviedb.org/settings/api.

## Admin dashboard (`/admin`)

A private dashboard with live visitors, page views, bounce rate, locations, devices, sources, retention, what people watch and search, server reliability, each visit's step-by-step journey, and reviews. All data is collected by the site itself (`src/analytics.ts` → `/api/e`) and stored in Postgres. Design notes: `docs/superpowers/specs/2026-10-06-admin-crm-design.md`.

One-time setup on Vercel:

1. **Database.** Vercel → Storage → add **Neon** (free) and connect it to this project. It sets `DATABASE_URL`. Tables are created automatically on first use. Existing reviews in Redis are copied over once, the first time you open the dashboard.
2. **Clerk.** Create an application at dashboard.clerk.com and add `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to the Vercel project.
   - Lock it down: *Configure → Restrictions → Sign-up mode → Restricted* so nobody else can create an account.
   - Remember devices: *Configure → Sessions* → set the maximum lifetime long (for example 90 days) and turn the inactivity timeout off.
3. **Admins.** Open `/admin`, sign in, and the page shows your user ID. Add it to `ADMIN_USER_IDS` and redeploy.
4. **Vercel Analytics numbers.** Create a token at vercel.com/account/settings/tokens and add `VERCEL_TOKEN`, `VERCEL_ANALYTICS_PROJECT_ID` and `VERCEL_ANALYTICS_TEAM_ID` (from `.vercel/project.json`). Visitors, page views and countries then come straight from Vercel, so they match its dashboard exactly; everything else (live, bounce rate, plays, journeys) comes from Cucuflix's own tracking. Without the token the dashboard shows its own counts and says so. Days run midnight to midnight UTC, like Vercel's, and on the Hobby plan Vercel keeps 31 days of history.
5. **Cleanup job.** Add `CRON_SECRET` (any long random string). The nightly job in `vercel.json` deletes step-by-step event details older than 90 days; visit totals are kept forever.

Tests: `npm test` runs the tracker and every report against an in-memory Postgres.
