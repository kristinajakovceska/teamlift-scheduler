import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { config } from '../config';

export interface BusyInterval {
  start: number; // epoch ms
  end: number;
}

export interface CalendarStatus {
  enabled: boolean;
  ok: boolean;
  calendarId: string | null;
  error: string | null;
  checkedAt: string | null;
  /** Result of the last attempt to add a booking to the calendar (null = not tried yet). */
  writeOk: boolean | null;
  writeError: string | null;
}

export interface CalendarBooking {
  id: string; // booking UUID
  name: string;
  email: string;
  topic: string | null;
  startsAt: string; // "YYYY-MM-DDTHH:MM" wall-clock in config.timezone
  durationMinutes: number;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
// readonly for free/busy; events to add bookings (needs "Make changes to events" sharing).
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
const CACHE_MS = 60_000; // guests poll every 15 s; Google is asked at most once a minute
const WINDOW_DAYS = 60;

/**
 * Reads the host's busy times from Google Calendar (free/busy only — never event details)
 * using a service account the host has shared their calendar with.
 *
 * Auth is a hand-rolled service-account JWT (RS256 via node:crypto), so no googleapis
 * dependency is needed. If anything fails, it "fails open": slots stay bookable and the
 * host dashboard shows the error, so a Google outage can't take the booking page down.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly key = parseKey(config.googleServiceAccountKey);
  private token?: { value: string; expiresAt: number };
  private cache?: { busy: BusyInterval[]; fetchedAt: number };
  private inFlight?: Promise<BusyInterval[]>;
  private status: CalendarStatus = {
    enabled: this.enabled,
    ok: false,
    calendarId: config.googleCalendarId ?? null,
    error: null,
    checkedAt: null,
    writeOk: null,
    writeError: null,
  };

  get enabled(): boolean {
    return Boolean(this.key && config.googleCalendarId);
  }

  getStatus(): CalendarStatus {
    return this.status;
  }

  /** Busy intervals for the next WINDOW_DAYS, cached for a minute. Empty if disabled or failing. */
  async busyIntervals(): Promise<BusyInterval[]> {
    if (!this.enabled) return [];
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_MS) return this.cache.busy;
    // Concurrent requests share one Google call instead of stampeding the API.
    this.inFlight ??= this.fetchBusy().finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  private async fetchBusy(): Promise<BusyInterval[]> {
    const timeMin = new Date();
    const timeMax = new Date(timeMin.getTime() + WINDOW_DAYS * 86_400_000);
    try {
      const res = await fetch(`${CALENDAR_API}/freeBusy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: [{ id: config.googleCalendarId }],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`Google Calendar HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const data = (await res.json()) as {
        calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason: string }[] }>;
      };
      const calendar = data.calendars?.[config.googleCalendarId!];
      if (calendar?.errors?.length) {
        const reason = calendar.errors[0].reason;
        throw new Error(
          reason === 'notFound'
            ? `Calendar not shared with ${this.key!.client_email}. Share it with "See only free/busy".`
            : `Google Calendar error: ${reason}`,
        );
      }

      const busy = (calendar?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
      this.cache = { busy, fetchedAt: Date.now() };
      this.status = { ...this.status, ok: true, error: null, checkedAt: new Date().toISOString() };
      return busy;
    } catch (err) {
      const message = (err as Error).message;
      if (this.status.error !== message) this.logger.warn(message);
      this.status = { ...this.status, ok: false, error: message, checkedAt: new Date().toISOString() };
      // Keep serving the last good answer if we have one; otherwise fail open.
      return this.cache?.busy ?? [];
    }
  }

  /**
   * Adds a booking to the host's calendar. The event ID is derived from the booking UUID,
   * so retries and concurrent syncs can never create duplicates (Google answers 409).
   * Returns false if the calendar isn't writable yet; never throws.
   */
  async addBookingEvent(b: CalendarBooking): Promise<boolean> {
    if (!this.enabled) return false;
    const end = addMinutesToWallClock(b.startsAt, b.durationMinutes);
    try {
      const res = await this.calendarRequest('POST', `/calendars/${encodeURIComponent(config.googleCalendarId!)}/events`, {
        id: eventId(b.id),
        summary: `LiftHours: ${b.name}`,
        description: [`Booked via LiftHours`, `Name: ${b.name}`, `Email: ${b.email}`, b.topic ? `Topic: ${b.topic}` : null]
          .filter(Boolean)
          .join('\n'),
        start: { dateTime: `${b.startsAt}:00`, timeZone: config.timezone },
        end: { dateTime: `${end}:00`, timeZone: config.timezone },
        // Google won't let a service account invite attendees on a personal Gmail calendar,
        // so the guest is listed in the description and gets the .ics from the booking page.
      });
      if (!res.ok && res.status !== 409) {
        const body = await res.text();
        throw new Error(
          res.status === 403
            ? `No write access. Share the calendar with ${this.key!.client_email} as "Make changes to events".`
            : `Google Calendar HTTP ${res.status}: ${body.slice(0, 200)}`,
        );
      }
      this.status = { ...this.status, writeOk: true, writeError: null };
      return true;
    } catch (err) {
      const message = (err as Error).message;
      if (this.status.writeError !== message) this.logger.warn(`Couldn't add booking to calendar: ${message}`);
      this.status = { ...this.status, writeOk: false, writeError: message };
      return false;
    }
  }

  /** Removes a booking's event (when the host cancels). Best effort: a missing event is fine. */
  async removeBookingEvent(bookingId: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const res = await this.calendarRequest(
        'DELETE',
        `/calendars/${encodeURIComponent(config.googleCalendarId!)}/events/${eventId(bookingId)}`,
      );
      if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      this.logger.warn(`Couldn't remove calendar event for booking ${bookingId}: ${(err as Error).message}`);
    }
  }

  private async calendarRequest(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(CALENDAR_API + path, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8_000),
    });
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: this.key!.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.key!.private_key, 'base64url');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Google auth failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);

    const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
    return access_token;
  }
}

/** True if [start, end) overlaps any busy interval. */
export function overlapsBusy(start: number, end: number, busy: BusyInterval[]): boolean {
  return busy.some((b) => start < b.end && end > b.start);
}

/** Google event IDs allow base32hex (0-9, a-v); a UUID's hex digits plus this prefix qualify. */
function eventId(bookingId: string): string {
  return `lifthours${bookingId.replaceAll('-', '')}`;
}

/** "2026-10-19T09:30" + 30 → "2026-10-19T10:00", without any time zone conversion. */
function addMinutesToWallClock(startsAt: string, minutes: number): string {
  const [date, time] = startsAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, min + minutes)).toISOString().slice(0, 16);
}

/** Accepts the service-account JSON key either raw or base64-encoded (easier in some env UIs). */
function parseKey(raw: string | undefined): ServiceAccountKey | undefined {
  if (!raw) return undefined;
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const key = JSON.parse(json) as ServiceAccountKey;
    if (!key.client_email || !key.private_key) throw new Error('missing client_email/private_key');
    return key;
  } catch (err) {
    new Logger(GoogleCalendarService.name).error(`GOOGLE_SERVICE_ACCOUNT_KEY is invalid: ${(err as Error).message}`);
    return undefined;
  }
}
