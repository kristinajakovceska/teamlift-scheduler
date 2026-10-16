import { useState } from 'react';
import { api } from '../api';
import { formatDayLong, formatRange, groupByDay, relativeDay } from '../format';
import type { HostSlot } from '../types';

interface Props {
  slots: HostSlot[];
  onChanged: () => void;
}

export function HostSlotList({ slots, onChanged }: Props) {
  if (slots.length === 0) {
    return (
      <div className="card empty">
        <div className="empty-icon" aria-hidden>✨</div>
        <h2>No upcoming slots</h2>
        <p>Use the form to publish your first office hours. They'll show up here and on your booking page.</p>
      </div>
    );
  }

  return (
    <div className="card host-list">
      <h2 className="card-title">Upcoming</h2>
      {groupByDay(slots).map(([key, daySlots]) => (
        <section key={key} className="host-day">
          <h3>
            {formatDayLong(key)} <span className="muted">· {relativeDay(key)}</span>
          </h3>
          <ul>
            {daySlots.map((slot) => (
              <HostSlotRow key={slot.id} slot={slot} onChanged={onChanged} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HostSlotRow({ slot, onChanged }: { slot: HostSlot; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteSlot(slot.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <li className={`host-slot${slot.booking ? ' is-booked' : ''}`}>
      <div className="host-slot-main">
        <span className="host-slot-time">{formatRange(slot.startsAt, slot.durationMinutes)}</span>
        {slot.booking ? (
          <span className="pill pill-booked">Booked</span>
        ) : (
          !slot.calendarBusy && <span className="pill pill-open">Open</span>
        )}
        {slot.calendarBusy && (
          <span className="pill pill-clash" title="You have an event in Google Calendar at this time, so guests can't book it.">
            Calendar clash
          </span>
        )}
      </div>

      {slot.booking && (
        <div className="booker">
          <span className="avatar" aria-hidden>
            {slot.booking.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{slot.booking.name}</strong>{' '}
            <a href={`mailto:${slot.booking.email}`} className="muted">
              {slot.booking.email}
            </a>
            {slot.booking.topic && <p className="topic">“{slot.booking.topic}”</p>}
          </div>
        </div>
      )}

      <div className="host-slot-actions">
        {error && <span className="error-text">{error}</span>}
        {confirming ? (
          <>
            <span className="muted small">{slot.booking ? `Cancel ${slot.booking.name}'s booking?` : 'Remove this slot?'}</span>
            <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
              {busy ? 'Removing…' : 'Yes, remove'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
              Keep
            </button>
          </>
        ) : (
          <button className="btn btn-link btn-sm" onClick={() => setConfirming(true)}>
            Remove
          </button>
        )}
      </div>
    </li>
  );
}
