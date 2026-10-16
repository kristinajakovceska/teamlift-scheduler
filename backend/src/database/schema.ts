// Idempotent schema, applied on every boot.
//
// Times are stored as TIMESTAMP (no time zone): the app has a single host time zone
// (APP_TIMEZONE), so "2026-11-03 10:00" always means 10:00 in that zone.
//
// The UNIQUE constraint on bookings.slot_id is what guarantees "no double bookings":
// even if two requests race, Postgres lets exactly one insert win.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS slots (
  id               SERIAL PRIMARY KEY,
  starts_at        TIMESTAMP   NOT NULL,
  duration_minutes INTEGER     NOT NULL CHECK (duration_minutes BETWEEN 10 AND 240),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slots_starts_at_idx ON slots (starts_at);

CREATE TABLE IF NOT EXISTS bookings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id              INTEGER     NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  email                TEXT        NOT NULL,
  topic                TEXT,
  confirmation_message TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Whether the booking has been added to the host's Google Calendar (retried until true).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calendar_synced BOOLEAN NOT NULL DEFAULT false;

-- Only bookings made after guest invites shipped get an invite; older rows keep false.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invite_guest BOOLEAN NOT NULL DEFAULT false;

-- The host's Google refresh token (single row), used to create events as the host.
CREATE TABLE IF NOT EXISTS google_oauth (
  id            INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email         TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase exposes the public schema through its Data API. With RLS on and no policies,
-- that API can read nothing; this server connects as the table owner, which bypasses RLS.
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_oauth ENABLE ROW LEVEL SECURITY;
`;
