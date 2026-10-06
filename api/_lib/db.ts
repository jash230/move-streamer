// Neon Postgres over HTTP. The schema is created on first use per cold start, so a fresh
// database needs no manual setup step.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export type Sql = NeonQueryFunction<false, false>

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    visitor_id text NOT NULL,
    started_at timestamptz NOT NULL,
    last_seen timestamptz NOT NULL,
    pageviews integer NOT NULL DEFAULT 0,
    engaged boolean NOT NULL DEFAULT false,
    entry_path text NOT NULL,
    country text, region text, city text,
    device text, browser text, os text,
    referrer text, utm_source text, utm_medium text, utm_campaign text
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_started_idx ON sessions (started_at)`,
  `CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON sessions (last_seen)`,
  `CREATE INDEX IF NOT EXISTS sessions_visitor_idx ON sessions (visitor_id, started_at)`,
  `CREATE TABLE IF NOT EXISTS events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id text NOT NULL,
    visitor_id text NOT NULL,
    at timestamptz NOT NULL,
    type text NOT NULL,
    path text NOT NULL,
    props jsonb NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS events_type_at_idx ON events (type, at)`,
  `CREATE INDEX IF NOT EXISTS events_session_idx ON events (session_id, at)`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text NOT NULL DEFAULT '',
    name text NOT NULL DEFAULT '',
    page text NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS reviews_at_idx ON reviews (at)`,
]

let client: Sql | null = null
let ready: Promise<unknown> | null = null

// Vercel's Neon integration sets DATABASE_URL; POSTGRES_URL covers older Vercel Postgres setups.
export async function db(): Promise<Sql | null> {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) return null
  client ??= neon(url)
  const sql = client
  ready ??= sql.transaction(SCHEMA.map((s) => sql.query(s))).catch((e) => {
    ready = null
    throw e
  })
  await ready
  return sql
}
