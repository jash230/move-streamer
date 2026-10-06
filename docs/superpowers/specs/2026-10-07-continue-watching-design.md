# Continue Watching

Feature 1 from `features.md` ("Pick up where you left off"), core part: a Continue Watching row on Home, resume at the right episode and time, the last episode remembered per show, and a way to remove titles from the row. My List and Mark as watched come later and build on the same store.

## Decisions

- **Browser only.** Progress lives in localStorage (`cucuflix.progress.v1`). No login, no server. The store is one module, so a sync code (features.md §5) can be added later without touching the UI.
- **Our own record.** Players keep their own history, but per server and unreadable from Home, so we save position ourselves from the postMessage events Watch already listens to.

## Store (`src/progress.ts`)

One entry per title, keyed `${type}-${id}`:

```ts
{ id, type, title, poster_path, backdrop_path, season?, episode?, position, duration, updatedAt }
```

- `saveProgress(entry)`, `getProgress(type, id)`, `removeProgress(type, id)`, `listProgress()` (newest first).
- `useContinueWatching()` re-renders on changes in this tab and others (`storage` event).
- Capped at 50 entries; the oldest are dropped.
- Every storage access is wrapped in try/catch; with no storage the row simply doesn't appear.

## Rules

- **Starting:** an entry is created once a title has played for 60s, so a quick look doesn't fill the row.
- **Saving:** at most every 10s while playing, and when the page is hidden or left.
- **Finished:** the player reports the end, or ≥ 90% is watched.
  - Movie: removed from the row.
  - Show: moved to the next episode at 0:00 (shown as "Up next"); removed after the last episode.
- **Removing:** the × on a card deletes the entry.

## Capturing (`src/api.ts`, `src/pages/Watch.tsx`)

`playbackProgress(raw, want)` sits next to `playbackState` and returns `{ position, duration }` from the same message shapes (VidSrc `player_progress` / `player_duration`, MEDIA_DATA `watched` / `duration`, generic `currentTime` / `duration`), only for the title and episode on screen.

## Resume (`src/pages/Watch.tsx`, `src/api.ts`)

- Opening a show starts at its saved episode instead of the first one.
- `Server.url` takes an optional start time. VidLink passes it as `startAt` (seconds). Servers without a start-time parameter still open the right episode, and their own memory usually restores the time.
- The play button reads "Resume S2 · E3" for shows and "Resume from 41:10" for movies.

## Row (`src/pages/Home.tsx`, `src/components/Row.tsx`, `src/components/Card.tsx`)

- First row on Home, only when it has entries.
- `Row` accepts ready `items` as well as `load`.
- Cards get a thin progress bar, an "S2 · E3" subtitle and an × button (doesn't open the title). Clicking a card opens `/:type/:id?play=1`, which starts playing right away.

## Testing

- vitest: the store (save, list order, cap, remove, finished rules) and `playbackProgress` on the captured message shapes.
- `npm run build`, `npm test`, then a real-browser check on a Vercel preview before main is fast-forwarded.
