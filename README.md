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

## Viewer accounts (Supabase)

Signed-out viewers keep Continue Watching, My List and watched episodes in their browser, as before. Signing in (email + password) saves them to the viewer's account, so pause points and the saved list follow them to any device. The first sign-in folds the browser's signed-out history into the account; signing out clears it from that browser. Code: `src/auth.ts` (sign-in), `src/sync.ts` (mirroring the local stores to Supabase), `src/components/AccountDialog.tsx`.

One-time setup:

1. **Project.** Create a free project at [supabase.com](https://supabase.com/dashboard).
2. **Tables.** Open *SQL Editor*, paste `supabase/migrations/0001_accounts.sql` and run it (or `supabase link` then `supabase db push`). It creates `progress`, `my_list` and `watched` with row-level security, so each viewer can only read and change their own rows.
3. **Auth URLs.** *Authentication → URL Configuration*: set **Site URL** to your production URL and add `http://localhost:5173` plus your Vercel domains (e.g. `https://*.vercel.app`) under **Redirect URLs**. Confirmation and password-reset emails link back here.
4. **Email confirmation.** On by default: new viewers confirm their email before their first sign-in. To skip it, turn off *Authentication → Sign In / Providers → Email → Confirm email*. Supabase's built-in mailer sends only a few emails per hour; for real traffic add your own SMTP under *Authentication → Emails*.
5. **Keys.** *Project Settings → API*: copy the project URL and the anon (publishable) key into `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` and in the Vercel project's environment variables, then redeploy.

Without those two keys the site runs as before and the sign-in button is hidden.

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
