// Date helpers. Slot times are "wall clock" times in the host's single time zone, so we build
// Date objects from their parts and never let the browser shift them.

const LOCALE = 'en-GB';

export function parseStartsAt(startsAt: string): Date {
  const [date, time] = startsAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

export const dayKey = (startsAt: string) => startsAt.slice(0, 10);

export function toDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addMinutes(startsAt: string, minutes: number): Date {
  return new Date(parseStartsAt(startsAt).getTime() + minutes * 60_000);
}

export const formatTime = (date: Date) =>
  date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

export function formatRange(startsAt: string, durationMinutes: number): string {
  return `${formatTime(parseStartsAt(startsAt))} – ${formatTime(addMinutes(startsAt, durationMinutes))}`;
}

export function formatDayLong(key: string): string {
  return parseStartsAt(`${key}T00:00`).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "Today", "Tomorrow", or a short weekday like "Wed". */
export function relativeDay(key: string): string {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (key === toDayKey(today)) return 'Today';
  if (key === toDayKey(tomorrow)) return 'Tomorrow';
  return parseStartsAt(`${key}T00:00`).toLocaleDateString(LOCALE, { weekday: 'short' });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Groups already-sorted slots into [dayKey, slots] pairs. */
export function groupByDay<T extends { startsAt: string }>(slots: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const slot of slots) {
    const key = dayKey(slot.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return [...groups.entries()];
}

/** Builds a downloadable .ics so guests can drop the session straight into their calendar. */
export function calendarFileUrl(opts: { startsAt: string; durationMinutes: number; title: string; description: string }) {
  const stamp = (d: Date) => toDayKey(d).replaceAll('-', '') + 'T' + formatTime(d).replace(':', '') + '00';
  const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LiftHours//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@lifthours`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${stamp(parseStartsAt(opts.startsAt))}`,
    `DTEND:${stamp(addMinutes(opts.startsAt, opts.durationMinutes))}`,
    `SUMMARY:${escape(opts.title)}`,
    `DESCRIPTION:${escape(opts.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
}
