# Cucuflix

A React + Vite site for browsing movies and TV shows with embedded players.

- **Metadata:** [TMDB](https://www.themoviedb.org/) (titles, posters, seasons, episodes)
- **Players:** Videasy (default, no pop-ups) and VidSrc (backup, may show pop-ups)
- **Hosting:** Netlify static hosting and Netlify Functions

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your TMDB key and any optional services
npm run dev
```

Get a TMDB key at https://www.themoviedb.org/settings/api.

## Deploy to Netlify

Connect this Git repository to Netlify. The root `netlify.toml` sets the build command (`npm run build`), publish directory (`dist`), Node version, route rewrites, response headers, API Functions, and the nightly cleanup schedule.

Copy the existing production values from your current deployment into Netlify's site environment variables. The names are listed in `.env.example`. Vite variables beginning with `VITE_` are included in the browser build; keep the other keys server-only.

Keep using the existing Neon database, Supabase project, and Clerk application so viewer accounts and dashboard history remain connected. Set `DATABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `ADMIN_USER_IDS` in Netlify. Set `CRON_SECRET` for the protected cleanup endpoint. Add the Supabase service key and optional Upstash variables if those features are enabled.

After the Netlify site is published, attach `cucuflix.online` in Netlify's domain settings and point the domain's DNS records to Netlify. Update Supabase's **Authentication → URL Configuration** with the production site URL and the Netlify site URL (for example, `https://your-site.netlify.app/**`) as redirect URLs. Update Clerk's allowed domains and redirect URLs to include the production domain.

The admin dashboard's visitor, page view, location, device, playback, and review reports use Cucuflix's own tracker and database. Netlify provides the visitor's country, region, and city to the tracker. The nightly scheduled Function runs at 03:00 UTC and deletes event details older than 90 days; session totals remain.

## Viewer accounts (Supabase)

Signed-out viewers keep Continue Watching, My List, and watched episodes in their browser. Signing in (email + password) saves them to the viewer's account, so pause points and the saved list follow them to any device. The first sign-in folds the browser's signed-out history into the account; signing out clears it from that browser. Code: `src/auth.ts` (sign-in), `src/sync.ts` (mirroring the local stores to Supabase), `src/components/AccountDialog.tsx`.

One-time setup:

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Open *SQL Editor*, paste `supabase/migrations/0001_accounts.sql`, and run it (or use `supabase link` and `supabase db push`). It creates `progress`, `my_list`, and `watched` with row-level security, so each viewer can only read and change their own rows.
3. In *Authentication → URL Configuration*, set **Site URL** to the production URL and add `http://localhost:5173` plus your Netlify site URL under **Redirect URLs**. Confirmation and password-reset emails link back here.
4. Email confirmation is on by default. Supabase's built-in mailer sends only a few emails per hour; for real traffic add your own SMTP under *Authentication → Emails*.
5. In *Project Settings → API*, copy the project URL and anon (publishable) key into `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` and the Netlify site's environment variables, then redeploy.

Without those two keys the site runs as before and the sign-in button is hidden.

## Admin dashboard (`/yardenos`)

The private dashboard shows live visitors, page views, bounce rate, locations, devices, sources, retention, viewing activity, playback reliability, sign-ups, and reviews. Event data is collected by the site itself (`src/analytics.ts` → `/api/e`) and stored in Neon. Design notes: `docs/superpowers/specs/2026-10-06-admin-crm-design.md`.

One-time setup:

1. **Database.** Create or reuse a Neon database and set its connection string as `DATABASE_URL` in Netlify. Tables are created automatically on first use. Existing reviews in Upstash Redis are copied over once, the first time you open the dashboard.
2. **Clerk.** Create or reuse an application at [dashboard.clerk.com](https://dashboard.clerk.com) and set `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in Netlify. In Clerk, restrict sign-ups to admins and set a long session lifetime.
3. **Admins.** Open `/yardenos`, sign in, and the page shows your user ID. Add it to `ADMIN_USER_IDS` in Netlify and redeploy.
4. **Supabase sign-ups.** To count viewer account sign-ups in the dashboard, set `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) in Netlify.
5. **Cleanup job.** Set `CRON_SECRET` to a long random value. Netlify runs the scheduled cleanup Function nightly; `/api/cron` also requires this value in its bearer token.

`npm test` runs the tracker and reports against an in-memory Postgres database.
