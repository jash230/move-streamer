# Admin CRM (`/admin`)

One private place to see how Cucuflix is used: traffic, people, what they watch, playback problems and reviews. All data is first-party; nothing is read from Vercel Analytics.

## Decisions

- **Tracking is ours.** A small client tracker (`src/analytics.ts`) batches events to `/api/e`. No IPs are stored; each browser gets a random visitor ID (localStorage) and a session ID that expires after 30 minutes idle.
- **One database:** Neon Postgres (`DATABASE_URL`). Tables: `sessions`, `events`, `reviews`. Reviews move out of Redis (copied once, automatically). Redis stays only for rate limits.
- **Auth:** Clerk. Every `/api/admin` call verifies the Clerk session token server-side and checks the user ID against `ADMIN_USER_IDS`. Public sign-ups disabled and a long session lifetime are set in the Clerk dashboard ("remember devices").
- **Retention:** sessions are kept forever; raw events older than 90 days are deleted nightly by `/api/cron`. So visitors, page views, bounce rate, locations, devices and sources work for any range; titles, searches, playback and journeys cover the last 90 days.

## Events

| Event | Sent when | Data |
|---|---|---|
| `page_view` | route changes | path |
| `title_view` | a title page loads | id, media type, title |
| `play_start` | the player starts | id, media type, title, season, episode, server |
| `play_finish` | the player reports the end | same as play_start |
| `server_switch` | the viewer changes server | from, to, reason (`picker` or `try_next`) |
| `search` | results load, or a suggestion is picked | query, result count |
| `heartbeat` | every 30s while the tab is visible | none (only updates `sessions.last_seen`) |

Location (country, region, city) comes from Vercel's `x-vercel-ip-*` headers; device, browser and OS from the user agent; source from the referrer and UTM tags of the first page. Bots are dropped.

## Definitions

- **Visitor:** a distinct visitor ID. **Visit:** a session.
- **Bounce:** a visit that entered on `/` and did nothing else — one page view, no other page, no title, no play, no search. **Bounce rate** = bounces ÷ all visits.
- **Live now:** visits with activity in the last 2 minutes.
- **Typical visit:** median time from first to last activity in a visit.
- **Returning visitor:** first visit was before the selected range. **Came back within N days:** a visitor whose first visit is in the range started another visit more than 30 minutes later and within N days.

## Dashboard

Date presets (Today, 7, 30, 90 days, All time) above every page; each number compares with the previous period of equal length.

- **Overview:** live sentence, plain-language period summary, visitors / page views / bounce rate / typical visit, trend chart (visitors, page views, plays), top locations, latest reviews.
- **Audience:** countries, cities, devices, browsers, systems, sources, campaigns, new vs returning, retention.
- **Watching:** journey funnel (visit → opened a title → pressed play → finished), top titles, top searches, searches with no results.
- **Playback:** per server: plays, finishes, times viewers switched away, "try next server" presses.
- **Visitors:** recent visits with location, device, source, pages and length; each opens a step-by-step journey.
- **Reviews:** average, star distribution, all reviews.

## API

- `POST /api/e` — ingest. Validates, rate-limits per IP, upserts the session, inserts events.
- `GET /api/admin?report=<name>&range=<preset>` — admin reports (`live`, `overview`, `audience`, `watching`, `playback`, `visitors`, `journey`, `reviews`). A single function keeps the deployment under the Hobby function limit.
- `GET /api/cron` — nightly cleanup, authorized by `CRON_SECRET`.

## Environment

`DATABASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_USER_IDS`, `CRON_SECRET`, optional `ADMIN_TZ` (default `Asia/Jerusalem`). `REVIEWS_ADMIN_KEY` is retired.

## Testing

Vitest unit tests for the pure server logic: batch validation, session summary and bounce rules, user-agent parsing, referrer and range handling.
