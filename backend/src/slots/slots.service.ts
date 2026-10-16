import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { config } from '../config';
import { DatabaseService } from '../database/database.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { HostSlot, PublicSlot } from './slot.types';

// Format timestamps as plain strings in SQL so no driver ever shifts them between time zones.
const STARTS_AT = `to_char(s.starts_at, 'YYYY-MM-DD"T"HH24:MI')`;
// "Now" expressed in the host's time zone, comparable with the stored TIMESTAMP values.
const NOW = `(now() AT TIME ZONE $1)`;

@Injectable()
export class SlotsService {
  constructor(private readonly db: DatabaseService) {}

  /** Upcoming slots for the public booking page. */
  listUpcoming(): Promise<PublicSlot[]> {
    return this.db.query<PublicSlot>(
      `SELECT s.id, ${STARTS_AT} AS "startsAt", s.duration_minutes AS "durationMinutes",
              (b.id IS NOT NULL) AS "isBooked"
       FROM slots s
       LEFT JOIN bookings b ON b.slot_id = s.id
       WHERE s.starts_at > ${NOW}
       ORDER BY s.starts_at`,
      [config.timezone],
    );
  }

  /** Upcoming slots including who booked them, for the host dashboard. */
  async listForHost(): Promise<HostSlot[]> {
    const rows = await this.db.query<PublicSlot & {
      bookingId: string | null;
      name: string | null;
      email: string | null;
      topic: string | null;
      bookedAt: string | null;
    }>(
      `SELECT s.id, ${STARTS_AT} AS "startsAt", s.duration_minutes AS "durationMinutes",
              (b.id IS NOT NULL) AS "isBooked",
              b.id AS "bookingId", b.name, b.email, b.topic,
              to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "bookedAt"
       FROM slots s
       LEFT JOIN bookings b ON b.slot_id = s.id
       WHERE s.starts_at + make_interval(mins => s.duration_minutes) > ${NOW}
       ORDER BY s.starts_at`,
      [config.timezone],
    );

    return rows.map(({ bookingId, name, email, topic, bookedAt, ...slot }) => ({
      ...slot,
      booking: bookingId
        ? { id: bookingId, name: name!, email: email!, topic, createdAt: bookedAt! }
        : null,
    }));
  }

  /** Creates one slot, or `count` back-to-back slots, refusing anything in the past or overlapping. */
  async create(dto: CreateSlotDto): Promise<PublicSlot[]> {
    const count = dto.count ?? 1;
    const start = `${dto.date} ${dto.startTime}`;
    const totalMinutes = dto.durationMinutes * count;

    // Postgres rejects impossible dates like 2026-02-31 when casting, which we surface as a 400.
    const [check] = await this.db
      .query<{ inPast: boolean; endsNextDay: boolean }>(
        `SELECT $2::timestamp <= ${NOW} AS "inPast",
                ($2::timestamp + make_interval(mins => $3)) > ($2::date + 1)::timestamp AS "endsNextDay"`,
        [config.timezone, start, totalMinutes],
      )
      .catch(() => {
        throw new BadRequestException('That date does not exist.');
      });
    if (check.inPast) throw new BadRequestException('Slots must start in the future.');
    if (check.endsNextDay) throw new BadRequestException('Slots must end on the same day they start.');

    const overlapping = await this.db.query<{ startsAt: string }>(
      `SELECT ${STARTS_AT} AS "startsAt" FROM slots s
       WHERE s.starts_at < $1::timestamp + make_interval(mins => $2)
         AND s.starts_at + make_interval(mins => s.duration_minutes) > $1::timestamp
       ORDER BY s.starts_at LIMIT 1`,
      [start, totalMinutes],
    );
    if (overlapping.length) {
      const clash = overlapping[0].startsAt.slice(11);
      throw new ConflictException(`This overlaps an existing slot at ${clash}.`);
    }

    // One INSERT for the whole batch, so it either fully succeeds or fully fails.
    return this.db.query<PublicSlot>(
      `INSERT INTO slots (starts_at, duration_minutes)
       SELECT $1::timestamp + make_interval(mins => $2 * i), $2
       FROM generate_series(0, $3 - 1) AS i
       RETURNING id, to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI') AS "startsAt",
                 duration_minutes AS "durationMinutes", false AS "isBooked"`,
      [start, dto.durationMinutes, count],
    );
  }

  /** Removes a slot (and its booking, if any — the host is cancelling it). */
  async remove(id: number): Promise<void> {
    const deleted = await this.db.query('DELETE FROM slots WHERE id = $1 RETURNING id', [id]);
    if (!deleted.length) throw new NotFoundException('Slot not found.');
  }
}
