import { useState } from 'react';
import { api } from '../api';
import { usePolling } from '../usePolling';

/** Tells the host whether Google Calendar clash detection is on and working. */
export function CalendarStatusNote() {
  const { data: status } = usePolling(api.calendarStatus, 60_000);
  const [oauthResult] = useState(readOAuthResult);
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
    <>
      <p className="small hero-note calendar-ok">
        📅 Connected to Google Calendar ({status.calendarId}). Slots that clash with your events are unavailable to
        guests{status.writeOk ? ', and new bookings are added to your calendar.' : '.'}
      </p>
      {status.writeOk === false && (
        <p className="small hero-note calendar-error" role="alert">
          ⚠️ Bookings aren't being added to your calendar yet: {status.writeError}
        </p>
      )}
      {oauthResult?.ok === false && (
        <p className="small hero-note calendar-error" role="alert">
          ⚠️ {oauthResult.message}
        </p>
      )}
      {status.invites.connectedAs ? (
        <p className="small hero-note calendar-ok">
          ✉️ New guests get a Google Calendar invite from {status.invites.connectedAs}.
        </p>
      ) : (
        status.invites.available && (
          <p className="small hero-note">
            <a className="btn btn-ghost btn-sm" href={api.googleConnectUrl}>
              Connect Google to send guests calendar invites
            </a>
          </p>
        )
      )}
    </>
  );
}

/** Reads (and then hides) the ?google=... result the OAuth callback redirects back with. */
function readOAuthResult(): { ok: boolean; message: string } | null {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('google');
  if (!result) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  return { ok: result === 'connected', message: params.get('message') ?? 'Google sign-in failed.' };
}
