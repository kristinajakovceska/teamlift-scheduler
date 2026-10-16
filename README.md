# LiftHours: AI Champion office hours

A booking app for the TeamLift internship challenge. A coach publishes 1:1 office-hours slots, and AI
champions book one with their name, email and what they want to cover. Gemini writes each guest a
personalised confirmation, and the booking syncs with the coach's Google Calendar both ways: busy times
block slots, bookings appear as events, and guests get a real calendar invite.

**Live app:** https://lifthours.onrender.com · **Host dashboard:** https://lifthours.onrender.com/#/host · **Video:** _optional_

> Hosted on Render's free plan, so the first visit after a quiet spell can take about 50 s to wake up.
> Data lives in Supabase Postgres.

| Guest: book a session | Host: publish & manage |
| --- | --- |
| Pick a day → pick a time → name + email (+ optional topic) → confirmed instantly, with a Gemini-written message, a Google Calendar invite by email and an "Add to calendar" file | Publish one slot or a block of back-to-back slots, see who booked what (and why), see clashes with your Google Calendar, remove or cancel slots |

## Features

### The brief's requirements

- **Create slots** (date, start time, duration) in the host dashboard (`#/host`).
- **See available slots** on the public page, grouped by day.
- **Book a slot** with name and email.
- **No double bookings.** A booked slot shows as taken, and the database refuses a second booking even if two
  people click at the same moment. The smoke test fires 8 simultaneous bookings at one slot: exactly 1 wins.

### Optional extra 1: AI confirmation (Gemini)

- `POST /api/bookings/:id/confirmation-message` asks **Gemini 3.5 Flash-Lite** (free tier, about 1–2 s) for a
  short, warm message that picks up the guest's topic and suggests something to bring.
- Booking never waits on the AI. The booking is saved instantly, and the message loads afterwards with a shimmer.
- Robust by design. If there's no key, an error or a timeout (20 s), or the reply is cut off (`MAX_TOKENS`), the
  guest gets a template message instead. Only real AI output is cached in the database.
- The prompt refers to the coach by name and doesn't assume their gender.

### Optional extra 2: Google Calendar, both ways

1. **Busy times block slots.** The API reads the host's busy times from the **Google Calendar free/busy API**,
   only times, never event titles or details. A free slot that overlaps an event is **Unavailable** to guests,
   flagged **Calendar clash** on the host dashboard, and refused by the booking endpoint (`409`).
2. **Bookings appear in the host's calendar** as "LiftHours: [name]", with email and topic in the description.
   Removing the slot on the dashboard deletes the event. Event IDs are derived from booking IDs, so retries can
   never create duplicates. Bookings that couldn't be added (Google down, no permission yet) are retried every 2 minutes.
3. **Guests get a real Google Calendar invite** with Accept/Decline. The host clicks **Connect Google** once on
   the dashboard (OAuth with offline access). New bookings are then created *as the host* with the guest as an
   attendee, so Google emails the invite and the RSVP shows on the host's event. Cancelling sends the guest
   Google's cancellation email. Bookings made before invites were switched on never get one (`invite_guest` column).

The calendar check **fails open**. If Google is unreachable, slots stay bookable and the dashboard shows the error.
Results are cached for 60 s, so guests polling every 15 s don't hammer Google.

### What I added myself

- **Theme:** office hours for TeamLift-style AI coaching rather than a generic calendar. The optional "What would
  you like to cover?" field helps the coach prepare, and feeds both the AI message and the calendar event.
- **Back-to-back slots:** publish e.g. 4 × 30 min in one go, with a live preview of the times. It's one
  `INSERT … SELECT generate_series`, so it either fully succeeds or fully fails.
- **Validation:** no overlapping slots, no slots in the past, no impossible dates (e.g. 31 Feb), no slots running past midnight.
- **Live freshness:** the slot list refreshes every 15 s and when the tab regains focus. If someone takes your slot
  while the form is open, you see a clear "this was just taken" message and the list refreshes.
- **Add to calendar:** a client-generated `.ics` file on the confirmation screen.
- **Host dashboard:** counts of upcoming, booked and open slots, a "Copy booking link" button, and status lines
  showing whether AI, calendar sync and guest invites are working.
- **Polish:** dark mode, mobile layout, keyboard and screen-reader friendly dialog, loading skeletons, empty and error states.
- **Privacy & security:** the public API never returns booker names or emails. Supabase tables have row-level
  security on, so its public Data API can read nothing. Only the calendar owner's Google account can connect.

## Tech stack

- **Frontend:** React 19 + TypeScript + Vite, plain CSS (custom properties, no UI library).
- **Backend:** NestJS 12 + TypeScript, with `class-validator` DTOs. In production it also serves the built React app.
- **Database:** PostgreSQL via `pg` (Supabase in production). With no `DATABASE_URL`, it falls back to
  [PGlite](https://pglite.dev), real Postgres compiled to WASM and saved to `backend/.data`, so it **runs locally
  with zero setup**: no Docker and no Postgres install.
- **AI:** Google Gemini REST API.
- **Calendar:** Google Calendar REST API. Service-account JWTs are signed with `node:crypto` and the OAuth flow is
  hand-written, so there are **no Google SDK dependencies**.
- **Hosting:** Render (one web service) + Supabase (Postgres).

## Run it locally

Requires **Node 20.12+** (built and tested on Node 24).

```bash
# 1. API (http://localhost:3000/api)
cd backend
npm install
cp .env.example .env      # everything in it is optional
npm run dev

# 2. Web app (http://localhost:5173), in a second terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Demo slots are seeded for the next few weekdays on first run. The host dashboard is
at http://localhost:5173/#/host. With an empty `.env` the core app works fully. AI and Google Calendar switch on
when you add their settings (see below).

**Smoke test** (with the API running): `cd backend && npm run smoke`, or against the live app with
`API_URL=https://lifthours.onrender.com/api npm run smoke`. It checks creating, listing and booking, validation,
overlap rules, privacy of the public list, the host view, removal, and the 8-way booking race.

## Configuration

All settings are environment variables on the API (`backend/.env` locally, Render → Environment in production).

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Real Postgres | Empty = embedded PGlite. Supabase: Session pooler URI + `?sslmode=no-verify` |
| `APP_TIMEZONE` | Everything | The host's single time zone. Default `Europe/London` |
| `HOST_NAME` | UI + AI message | Default `Alex, AI Coach` |
| `GEMINI_API_KEY` | AI confirmations | Free key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | AI confirmations | Default `gemini-3.5-flash-lite` |
| `GOOGLE_CALENDAR_ID` | Calendar | The host's calendar, usually their Gmail address |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Calendar | The service account's JSON key (raw JSON or base64) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Guest invites | OAuth "Web application" client |
| `PUBLIC_URL` | Guest invites | Public base URL for the OAuth redirect. Not needed on Render (uses `RENDER_EXTERNAL_URL`) |
| `CORS_ORIGIN` | Split hosting only | Only if the frontend is served from a different origin |
| `SEED_DEMO` | Demo data | `false` to skip seeding slots on an empty database |

## Google Calendar setup

**Clash detection + bookings in the host's calendar** (service account):

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and **enable the Google Calendar API**.
2. **IAM & Admin → Service accounts → Create** (no roles needed), then **Keys → Add key → JSON**.
3. In Google Calendar: **Settings → your calendar → Shared with → Add people**, add the service account's email
   with **Make changes to events**. Choose **See only free/busy** instead if you want clash detection only.
4. Set `GOOGLE_CALENDAR_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY`. The host dashboard shows "📅 Connected to Google Calendar".

**Guest invites** (OAuth). These are needed because Google doesn't let a service account invite attendees on a personal Gmail calendar:

5. **Google Auth Platform**: create the consent screen (External), and under **Audience → Test users** add the
   host's Gmail address.
6. **Clients → Create client → Web application**, with authorised redirect URI `https://<your-app>/api/host/google/callback`.
   Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
7. On the host dashboard, click **Connect Google to send guests calendar invites**, sign in as the calendar owner
   and allow calendar access. The dashboard then shows "✉️ New guests get a Google Calendar invite".

> While the OAuth app is in **Testing**, Google expires the connection after 7 days. Invites then stop (bookings
> and calendar events keep working) and the dashboard shows the **Connect Google** button again. Reconnecting is
> one click. Publishing and verifying the app with Google removes the limit.

## Deploying

Production is **one Render web service + a Supabase Postgres database**. NestJS serves the API under `/api`
and the built React app at `/`, so there's a single URL and no CORS setup.

1. **Supabase:** create a free project, then **Connect → Session pooler** and copy the URI. Add your password and
   append `?sslmode=no-verify`. Use a letters-and-numbers password, or URL-encode special characters.
   Tables are created on first boot.
2. **Render:** **New → Blueprint →** select this repo (`render.yaml`), and paste `DATABASE_URL`. Add the optional
   Gemini and Google settings from the table above whenever you like. Render redeploys on every push to `main`.

## How it works

```
frontend/src
  App.tsx                 hash routing (#/ guest, #/host), loads /api/config
  api.ts                  typed fetch client; turns API errors into readable messages
  usePolling.ts           fetch + refresh every 15 s and on window focus
  format.ts               date helpers (wall-clock times, never shifted by the browser) + .ics file
  components/
    BookingPage           day picker + time grid (Booked / Unavailable states)
    BookingDialog         form → confirmation, AI message, invite note, "Add to calendar"
    HostPage              stats, publish form, upcoming list, status lines
    CreateSlotsForm       date/time/duration + back-to-back count with live preview
    HostSlotList          slots by day with booker details, clash pills, remove with confirm
    CalendarStatusNote    calendar sync / invites status and the "Connect Google" button
    Modal, StatusCards    accessible dialog; shared loading and error cards

backend/src
  database/               pg Pool or PGlite behind one query(); idempotent schema applied on boot
  slots/                  public GET /slots; host GET/POST/DELETE /host/slots; clash flags
  bookings/               booking (UNIQUE-constraint race safety), AI message, calendar sync loop
  calendar/               free/busy + event create/delete (service account), host OAuth for invites
  ai/                     Gemini call, prompt, truncation handling, template fallback
```

**Data model**

- `slots`: `id`, `starts_at` (wall-clock `TIMESTAMP`), `duration_minutes`.
- `bookings`: `id` (UUID), `slot_id` (**UNIQUE**), `name`, `email`, `topic`, `confirmation_message` (cached AI text),
  `calendar_synced`, `invite_guest`.
- `google_oauth`: a single row with the host's Google refresh token.

**API**

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/slots` | Upcoming slots with `isBooked` and `calendarBusy` (no personal data) |
| POST | `/api/slots/:id/bookings` | Book: `{ name, email, topic? }` → `201`, or `409` if taken or the host is busy |
| POST | `/api/bookings/:id/confirmation-message` | AI confirmation (cached once generated) |
| GET | `/api/host/slots` | Upcoming slots with booking details and clash flags |
| POST | `/api/host/slots` | `{ date, startTime, durationMinutes, count? }` → 1–12 back-to-back slots |
| DELETE | `/api/host/slots/:id` | Remove a slot, cancelling its booking and calendar event |
| GET | `/api/host/calendar` | Calendar status: read/write health, invite connection |
| GET | `/api/host/google/connect`, `/api/host/google/callback` | One-time OAuth flow for guest invites |
| GET | `/api/config`, `/api/health` | Host name, time zone, which features are on · health check |

**Key decisions**

- **Double booking is prevented by the database, not app code.** `bookings.slot_id` is `UNIQUE`, so the insert
  *is* the availability check. A duplicate fails with Postgres error `23505`, which the API turns into a friendly `409`.
- **One time zone, stored as wall-clock time.** Slots are `TIMESTAMP` (no time zone) in `APP_TIMEZONE`, formatted
  to strings in SQL and parsed from their parts on the client. When comparing with Google's busy times, Postgres
  converts them with `AT TIME ZONE`, which handles daylight-saving changes. That's tested on both sides of the October clock change.
- **External services never block or break a booking.** Gemini runs after booking, calendar writes happen in the
  background with retries, and the free/busy check fails open.
- **Security without a login.** The brief has no accounts, so the host routes are open. The risky bit, linking a
  Google account, is guarded instead: only the account that owns `GOOGLE_CALENDAR_ID` is accepted, and the OAuth
  `state` is HMAC-signed and expires after 10 minutes.
- **Idempotent calendar sync.** Event IDs come from booking IDs (`lifthours<uuid>`), so a booking can be retried
  any number of times and still produce exactly one event.

## AI tools used

I built this with **Claude Code** (Anthropic's agentic coding CLI). I used it to scaffold the NestJS and Vite
projects, write the SQL and components, set up Supabase, Render and Google Cloud, and check every feature end to
end: smoke tests against the live API, mocked Google API tests, and clicking through the real UI in a browser.

Along the way it caught and fixed real issues:
- Gemini 2.5 Flash isn't available to new API users, so the app moved to Gemini 3.
- Gemini 3.8 Flash was too slow and its replies got cut off, so it moved to Flash-Lite and now handles cut-off replies.
- A booking's own calendar event was making its slot look like a clash; booked slots are now excluded.

I reviewed the design decisions: DB-level uniqueness, wall-clock time handling, keeping external services off the
booking path, and how to guard the Google connection.

## What I'd improve with more time

- **Host authentication** (even a magic link). `/host` is open, as the brief allowed.
- **Verify the Google OAuth app** so the invite connection doesn't expire every 7 days.
- **Let guests cancel or reschedule** from a link in their invite or a confirmation email.
- **Recurring availability** ("every Tuesday 2–4 pm") instead of one-off blocks.
- **Real migrations** (e.g. Drizzle/Prisma) instead of an idempotent boot-time schema, plus Jest/Playwright tests in CI.
- **Rate limiting** on the booking and AI endpoints.
- **Multiple time zones:** store `timestamptz` and show each guest their local time.
