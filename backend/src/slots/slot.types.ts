/** What anyone can see about a slot. Booker details are never exposed publicly. */
export interface PublicSlot {
  id: number;
  startsAt: string; // "YYYY-MM-DDTHH:MM" in the host time zone
  durationMinutes: number;
  isBooked: boolean;
}

/** What the host sees in their dashboard. */
export interface HostSlot extends PublicSlot {
  booking: {
    id: string;
    name: string;
    email: string;
    topic: string | null;
    createdAt: string;
  } | null;
}
