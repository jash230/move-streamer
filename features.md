# Cucuflix Features

The features we want to add, in the order we plan to build them. Add ideas anywhere; move them up when they matter more.

**Goal:** people enjoy Cucuflix and keep coming back because it's good, not because of tricks. Every feature should mean less friction between opening the site and watching, or always having something good to watch next.

**Status:** `[ ]` idea · `[~]` designing / in progress · `[x]` shipped

---

## 1. Pick up where you left off

The biggest reason people return to a streaming site.

- [x] **Continue Watching row** at the top of Home: the shows and movies you started, newest first, with a progress bar on each poster
- [x] **Resume playback** at the right episode and timestamp (Videasy, VidLink and VidFast already report `currentTime` and `duration`)
- [x] **Remember the last episode** per show, so opening a show takes you to where you stopped, not S1E1
- [x] **My List**: a + button on cards and title pages to save titles for later, with its own row and page
- [x] **Remove from Continue Watching**: an "×" on a card for things you've abandoned
- [x] **Mark as watched** for episodes and movies

> Decided 2026-10-07: browser only for now (localStorage, `src/progress.ts`); sync code later (section 5).

## 2. Always something next

- [ ] **"Because you watched X" rows** based on what's in Continue Watching
- [ ] **More like this** on title pages (TMDB recommendations and similar titles)
- [ ] **Trailers**: autoplay in the Hero, and on hover/long-press on cards
- [ ] **Richer title pages**: cast, rating, runtime, 
- [ ] **Genre and year filters** on Browse
- [ ] **Top 10 today** row with large rank numbers
- [ ] **"Surprise me"** button that picks a random well-rated title
- [ ] **New episodes** badge on shows in your list or Continue Watching when a new episode is out


## 3. Playback that never gets stuck

- [ ] **Auto-fallback**: if a server doesn't start within a few seconds, try the next one
- [ ] **Server health**: remember which servers worked for each title and try those first
- [ ] **Skip intro / skip recap** where the player supports it
- [ ] **Keyboard shortcuts**: space, F for fullscreen, N for next episode
- [ ] **Countdown to the next episode** with a cancel button (extend the current UpNext)

## 4. Speed and polish

- [ ] **Loading skeletons** instead of empty space while rows load
- [ ] **Faster images**: responsive poster sizes, lazy loading, blur-up placeholders
- [ ] **Installable app (PWA)**: add to home screen, opens full screen like an app
- [ ] **TV / remote friendly**: arrow-key navigation through rows
- [ ] **Mobile polish**: swipeable rows, larger tap targets, bottom navigation
- [ ] **Smooth page transitions**

## 5. Accounts and sync

- [ ] **Sync code**: a short code that brings your list and progress to another device, stored in Upstash Redis, no passwords
- [ ] **Full accounts** (email or Google sign-in) if the sync code isn't enough
- [ ] **Profiles**: separate lists for people sharing one device

## 6. Sharing and growth

- [ ] **Share button** on title pages with a preview card (Open Graph image) for WhatsApp, X and others
- [ ] **SEO page per title** so people searching for a show can find Cucuflix
- [ ] **Watch-funnel analytics**: track the steps home → title → play → finished to see where people drop off

---



## Ideas inbox

Unsorted ideas go here until we decide where they belong.

### 1. Better apis (no featured movies that get stuck)
### 2. Find similar movies - user watches something and gets prompted similar content to what he watched (at the end of shows/movies) at the bottom of pages etc..
### 3. End the issue of redirect ads in the streamed videos.
### 4. Add live streaming of sports evens (football,soccer, basketball) 
-
