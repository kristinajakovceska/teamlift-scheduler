import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { config } from '../config';
import { DatabaseService } from '../database/database.service';
import { CreateBookingDto } from './dto/create-booking.dto';

const UNIQUE_VIOLATION = '23505';

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
export class BookingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ai: AiService,
  ) {}

  async book(slotId: number, dto: CreateBookingDto): Promise<BookingResult> {
    const [slot] = await this.db.query<{ startsAt: string; durationMinutes: number; isPast: boolean }>(
      `SELECT to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI') AS "startsAt",
              duration_minutes AS "durationMinutes",
              starts_at <= (now() AT TIME ZONE $2) AS "isPast"
       FROM slots WHERE id = $1`,
      [slotId, config.timezone],
    );
    if (!slot) throw new NotFoundException('This slot no longer exists.');
    if (slot.isPast) throw new BadRequestException('This slot has already started.');

    // No "check then insert": the UNIQUE(slot_id) constraint makes the insert itself the
    // check, so two people clicking at the same moment can never both get the slot.
    try {
      const [booking] = await this.db.query<{ id: string }>(
        `INSERT INTO bookings (slot_id, name, email, topic) VALUES ($1, $2, $3, $4) RETURNING id`,
        [slotId, dto.name, dto.email, dto.topic || null],
      );
      return {
        id: booking.id,
        slotId,
        startsAt: slot.startsAt,
        durationMinutes: slot.durationMinutes,
        name: dto.name,
        email: dto.email,
        topic: dto.topic || null,
      };
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
}

