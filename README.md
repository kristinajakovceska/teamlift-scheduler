# LiftHours: AI Champion office hours

A small booking app for the TeamLift internship challenge. A coach publishes 1:1 office-hours
slots, and AI champions book one with their name, email and what they want to cover.
After booking, Gemini writes them a short, personalised confirmation.

**Live app:** _add link after deploying_ · **Video:** _optional_

| Guest: book a session | Host: publish & manage |
| --- | --- |
| Pick a day → pick a time → name + email (+ optional topic) → confirmed, with an AI-written message and an "Add to calendar" file | Publish one slot or a block of back-to-back slots, see who booked what (and why), remove or cancel slots |

## What it does

The brief's requirements:

- **Create slots** (date, start time, duration) in the host dashboard (`#/host`).
- **See available slots** on the public page, grouped by day.
- **Book a slot** with name and email.
- **No double bookings.** A booked slot shows as taken, and the database refuses a second booking even if two people click at the same moment.

The optional AI extra:

- `POST /api/bookings/:id/confirmation-message` calls **Gemini 2.5 Flash** (free tier) to write a warm confirmation that mentions the guest's topic. If no key is set, or the call fails, it falls back to a template, so booking never breaks.

What I added myself:

- **Theme:** the app is office hours for TeamLift-style AI coaching, not a generic calendar. The optional "What would you like to cover?" field helps the coach prepare and feeds the AI prompt.
- **Back-to-back slots:** the host can publish e.g. 4 × 30 min in one go, with a live preview of the times.
- **Overlap and past-time checks:** the host can't publish overlapping slots or slots in the past.
- **Live freshness:** the slot list re-fetches every 15 s and when the tab regains focus. If someone books "your" slot while the form is open, you get a clear "this was just taken" message and the list refreshes.
- **Add to calendar:** a client-generated `.ics` file.
- **Polish:** dark mode, mobile layout, keyboard and screen-reader friendly dialog, loading skeletons, empty and error states.
- **Privacy:** the public API never returns booker names or emails. Only the host endpoint does.

## Tech stack

- **Frontend:** React 19 + TypeScript + Vite, with plain CSS (custom properties, no UI library).
- **Backend:** NestJS 12 + TypeScript, with `class-validator` DTOs.
- **Database:** PostgreSQL through `pg`. With no `DATABASE_URL`, it falls back to [PGlite](https://pglite.dev) (real Postgres compiled to WASM and saved to `backend/.data`), so it **runs locally with zero setup**: no Docker and no Postgres install.
- **AI:** Google Gemini REST API (no SDK).

## Run it locally

Requires **Node 20.12+** (built and tested on Node 24).

```bash
# 1. API (http://localhost:3000/api)
cd backend
npm install
cp .env.example .env      # optional: add GEMINI_API_KEY / DATABASE_URL
npm run dev

# 2. Web app (http://localhost:5173), in a second terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Demo slots are seeded for the next few weekdays on first run.
The host dashboard is at http://localhost:5173/#/host.

**Enable the AI message:** get a free key at https://aistudio.google.com/apikey, put it in `backend/.env` as
`GEMINI_API_KEY=...`, and restart the API.

**Use a real Postgres instead of PGlite:** set `DATABASE_URL` in `backend/.env` (e.g. a free Neon or Supabase connection string).
Tables are created automatically on startup.

**Smoke test** (with the API running): `cd backend && npm run smoke`. This checks creating, listing, booking,
validation, overlap rules, the host view, and fires 8 simultaneous bookings at one slot to check that exactly one wins.

## Deploying

Production is **one Render web service + a Supabase Postgres database**. NestJS serves the API under `/api`
and the built React app at `/`, so there's a single URL and no CORS setup.

1. **Supabase:** create a free project, then **Connect → Session pooler** and copy the URI. Add your password
   and append `?sslmode=no-verify`. Tables are created on first boot, with RLS enabled so Supabase's public
   Data API can't read them.
2. **Render:** **New → Blueprint →** select this repo (`render.yaml`). Paste the URI as `DATABASE_URL`, and
   optionally a `GEMINI_API_KEY`.

The free Render plan sleeps after 15 minutes idle, so the first visit can take about 50 s to wake up.

## How it works

```
frontend/src
  App.tsx              hash routing (#/ guest, #/host) + loads /api/config
  api.ts               typed fetch client; turns API errors into readable messages
  usePolling.ts        fetch + refresh every 15 s and on window focus
  format.ts            date helpers (wall-clock times, never shifted by the browser) + .ics
  components/          BookingPage, BookingDialog, HostPage, CreateSlotsForm, HostSlotList, Modal

backend/src
  database/            pg Pool or PGlite behind one query() method; schema applied on boot
  slots/               public GET /slots, host GET/POST/DELETE /host/slots
  bookings/            POST /slots/:id/bookings, POST /bookings/:id/confirmation-message
  ai/                  Gemini call + prompt + template fallback
```

**API**

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/slots` | Upcoming slots with `isBooked` (no personal data) |
| POST | `/api/slots/:id/bookings` | Book: `{ name, email, topic? }` → `201`, or `409` if taken |
| POST | `/api/bookings/:id/confirmation-message` | AI confirmation text (cached after first generation) |
| GET | `/api/host/slots` | Upcoming slots including booking details |
| POST | `/api/host/slots` | `{ date, startTime, durationMinutes, count? }` → creates 1–12 back-to-back slots |
| DELETE | `/api/host/slots/:id` | Remove a slot (cancels its booking) |
| GET | `/api/config`, `/api/health` | Host name, time zone, AI on/off · health check |

**Key decisions**

- **Double booking is prevented by the database, not by app code.** `bookings.slot_id` is `UNIQUE`, so the
  insert *is* the availability check. A "check then insert" in code would have a race window. Here, a duplicate
  insert fails with Postgres error `23505`, which the API turns into a friendly `409`.
- **One time zone, stored as wall-clock time.** Slots are `TIMESTAMP` (no time zone) in `APP_TIMEZONE`, formatted
  to strings in SQL, and parsed from their parts on the client. A viewer in another time zone still sees exactly
  the times the host published.
- **The AI is separate from booking.** Booking returns instantly. The confirmation message is fetched afterwards
  (with a loading shimmer), so a slow or failing LLM can never block or break a booking.
- **Batch slot creation is a single `INSERT … SELECT generate_series`**, so it either fully succeeds or fully fails.

## AI tools used

I built this with **Claude Code** (Anthropic's agentic coding CLI). I used it to scaffold the NestJS and Vite
projects, write the SQL and components, run the smoke tests, and click through the UI in a real browser to check the
flow end to end. I reviewed the decisions: DB-level uniqueness for double bookings, wall-clock time handling,
keeping the AI call separate from booking, and the PGlite fallback for zero-setup local runs. The app itself uses
**Gemini 2.5 Flash** via Google AI Studio's free tier.

## What I'd improve with more time

- **Host authentication** (even a simple magic link). Right now `/host` is open, as the brief allowed.
- **Email confirmations** to the guest and host (e.g. Resend), plus a cancel/reschedule link for guests.
- **Google Calendar sync** to hide slots that clash with the host's real events.
- **Recurring availability** ("every Tuesday 2–4 pm") instead of one-off blocks.
- **Real migrations** (e.g. Drizzle/Prisma) instead of an idempotent boot-time schema, plus Jest/Playwright tests in CI.
- **Rate limiting** on the booking and AI endpoints.
- **Multiple time zones:** store `timestamptz` and show each guest their local time.
