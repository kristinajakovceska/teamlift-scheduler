import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { GoogleCalendarService, overlapsBusy } from '../calendar/google-calendar.service';
import { config } from '../config';
import { DatabaseService } from '../database/database.service';
import { CreateBookingDto } from './dto/create-booking.dto';

const UNIQUE_VIOLATION = '23505';
const CALENDAR_SYNC_MS = 2 * 60_000;

export interface BookingResult {
  id: string;
  slotId: number;
  startsAt: string;
  durationMinutes: number;
  name: string;
  email: string;
  topic: string | null;
}

@Injectable()
export class BookingsService implements OnApplicationBootstrap, OnModuleDestroy {
  private syncTimer?: NodeJS.Timeout;

  constructor(
    private readonly db: DatabaseService,
    private readonly ai: AiService,
    private readonly calendar: GoogleCalendarService,
  ) {}

  async book(slotId: number, dto: CreateBookingDto): Promise<BookingResult> {
    const [slot] = await this.db.query<{ startsAt: string; durationMinutes: number; isPast: boolean; startMs: number }>(
      `SELECT to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI') AS "startsAt",
              duration_minutes AS "durationMinutes",
              (extract(epoch FROM starts_at AT TIME ZONE $2) * 1000)::float8 AS "startMs",
              starts_at <= (now() AT TIME ZONE $2) AS "isPast"
       FROM slots WHERE id = $1`,
      [slotId, config.timezone],
    );
    if (!slot) throw new NotFoundException('This slot no longer exists.');
    if (slot.isPast) throw new BadRequestException('This slot has already started.');

    const busy = await this.calendar.busyIntervals();
    if (overlapsBusy(slot.startMs, slot.startMs + slot.durationMinutes * 60_000, busy)) {
      throw new ConflictException('Sorry, this time is no longer available. Please pick another one.');
    }

    // No "check then insert": the UNIQUE(slot_id) constraint makes the insert itself the
    // check, so two people clicking at the same moment can never both get the slot.
    try {
      const [booking] = await this.db.query<{ id: string }>(
        `INSERT INTO bookings (slot_id, name, email, topic, invite_guest) VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [slotId, dto.name, dto.email, dto.topic || null],
      );
      const result: BookingResult = {
        id: booking.id,
        slotId,
        startsAt: slot.startsAt,
        durationMinutes: slot.durationMinutes,
        name: dto.name,
        email: dto.email,
        topic: dto.topic || null,
      };
      // Add it to the host's Google Calendar in the background; the guest never waits on Google.
      void this.addToCalendar(result, true);
      return result;
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException('Sorry, someone just booked this slot. Please pick another one.');
      }
      throw err;
    }
  }

  /**
   * Returns the AI confirmation message for a booking, generating it on first request
   * and caching it in the database. Kept separate from `book()` so booking stays instant
   * and the UI can show the message as soon as the LLM responds.
   */
  async confirmationMessage(bookingId: string): Promise<{ message: string; source: 'ai' | 'template' }> {
    const [row] = await this.db.query<{
      name: string;
      topic: string | null;
      startsAt: string;
      durationMinutes: number;
      cached: string | null;
    }>(
      `SELECT b.name, b.topic, b.confirmation_message AS cached,
              to_char(s.starts_at, 'YYYY-MM-DD"T"HH24:MI') AS "startsAt",
              s.duration_minutes AS "durationMinutes"
       FROM bookings b JOIN slots s ON s.id = b.slot_id
       WHERE b.id = $1`,
      [bookingId],
    );
    if (!row) throw new NotFoundException('Booking not found.');
    if (row.cached) return { message: row.cached, source: 'ai' };

    const result = await this.ai.bookingConfirmation(row);
    // Only cache real AI output, so adding a key later upgrades old bookings too.
    if (result.source === 'ai') {
      await this.db.query('UPDATE bookings SET confirmation_message = $2 WHERE id = $1', [bookingId, result.message]);
    }
    return result;
  }

  onApplicationBootstrap() {
    if (!this.calendar.enabled) return;
    void this.syncCalendar();
    this.syncTimer = setInterval(() => void this.syncCalendar(), CALENDAR_SYNC_MS);
    this.syncTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.syncTimer);
  }

  /**
   * Retries upcoming bookings that aren't in Google Calendar yet, e.g. ones made before
   * write access was granted or while Google was unreachable.
   */
  async syncCalendar(): Promise<void> {
    const pending = await this.db.query<BookingResult & { inviteGuest: boolean }>(
      `SELECT b.id, b.slot_id AS "slotId", b.name, b.email, b.topic, b.invite_guest AS "inviteGuest",
              to_char(s.starts_at, 'YYYY-MM-DD"T"HH24:MI') AS "startsAt",
              s.duration_minutes AS "durationMinutes"
       FROM bookings b JOIN slots s ON s.id = b.slot_id
       WHERE NOT b.calendar_synced
         AND s.starts_at + make_interval(mins => s.duration_minutes) > (now() AT TIME ZONE $1)
       ORDER BY s.starts_at LIMIT 50`,
      [config.timezone],
    );
    for (const booking of pending) {
      if (!(await this.addToCalendar(booking, booking.inviteGuest))) break; // calendar not writable yet; try again later
    }
  }

  private async addToCalendar(booking: BookingResult, inviteGuest: boolean): Promise<boolean> {
    const added = await this.calendar.addBookingEvent(booking, inviteGuest);
    if (added) await this.db.query('UPDATE bookings SET calendar_synced = true WHERE id = $1', [booking.id]);
    return added;
  }
}
