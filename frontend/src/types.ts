/** Mirrors the API's response shapes. `startsAt` is "YYYY-MM-DDTHH:MM" in the host time zone. */
export interface Slot {
  id: number;
  startsAt: string;
  durationMinutes: number;
  isBooked: boolean;
  /** Clashes with the host's Google Calendar, so it can't be booked. */
  calendarBusy: boolean;
}

export interface HostSlot extends Slot {
  booking: {
    id: string;
    name: string;
    email: string;
    topic: string | null;
    createdAt: string;
  } | null;
}

export interface Booking {
  id: string;
  slotId: number;
  startsAt: string;
  durationMinutes: number;
  name: string;
  email: string;
  topic: string | null;
}

export interface AppConfig {
  hostName: string;
  timezone: string;
  aiEnabled: boolean;
  calendarEnabled: boolean;
}

export interface CalendarStatus {
  enabled: boolean;
  ok: boolean;
  calendarId: string | null;
  error: string | null;
  checkedAt: string | null;
}

export interface NewSlotsInput {
  date: string;
  startTime: string;
  durationMinutes: number;
  count: number;
}
