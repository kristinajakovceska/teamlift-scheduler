import { api } from '../api';
import { usePolling } from '../usePolling';

/** Tells the host whether Google Calendar clash detection is on and working. */
export function CalendarStatusNote() {
  const { data: status } = usePolling(api.calendarStatus, 60_000);
  if (!status) return null;

  if (!status.enabled) {
    return (
      <p className="muted small hero-note">
        Google Calendar isn't connected. Set GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT_KEY on the API to hide times
        you're busy.
      </p>
    );
  }
  if (!status.ok) {
    return (
      <p className="small hero-note calendar-error" role="alert">
        ⚠️ Google Calendar check failed, so all slots stay bookable: {status.error}
      </p>
    );
  }
  return (
    <p className="small hero-note calendar-ok">
      📅 Connected to Google Calendar ({status.calendarId}). Slots that clash with your events are unavailable to guests.
    </p>
  );
}
