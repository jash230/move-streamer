-- Cucuflix viewer accounts: what each signed-in viewer watched, where they paused, and their saved list.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.

-- Where each started title was left (src/progress.ts). Times are milliseconds since 1970, like the app.
create table if not exists public.progress (
  user_id       uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  media_type    text   not null check (media_type in ('movie', 'tv')),
  tmdb_id       text   not null,
  title         text   not null,
  poster_path   text,
  backdrop_path text,
  date          text   not null default '',
  season        int,
  episode       int,
  position      double precision not null default 0,
  duration      double precision not null default 0,
  updated_at    bigint not null,
  primary key (user_id, media_type, tmdb_id)
);

-- My List (src/library.ts). `media` holds the title card fields the site already keeps.
create table if not exists public.my_list (
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  media_type text   not null check (media_type in ('movie', 'tv')),
  tmdb_id    text   not null,
  media      jsonb  not null,
  added_at   bigint not null,
  primary key (user_id, media_type, tmdb_id)
);

-- Movies and episodes marked watched, keyed like the app: `movie-550`, `tv-1399-1-2`.
create table if not exists public.watched (
  user_id   uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  key       text   not null,
  marked_at bigint not null,
  primary key (user_id, key)
);

-- Each viewer can only see and change their own rows.
alter table public.progress enable row level security;
alter table public.my_list  enable row level security;
alter table public.watched  enable row level security;

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own list" on public.my_list;
create policy "own list" on public.my_list for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own watched" on public.watched;
create policy "own watched" on public.watched for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.progress, public.my_list, public.watched to authenticated;
