import { type FormEvent, useEffect, useState } from 'react';
import { ApiError, api } from '../api';
import { calendarFileUrl, dayKey, formatDayLong, formatDuration, formatRange } from '../format';
import type { AppConfig, Booking, Slot } from '../types';
import { Modal } from './Modal';

interface Props {
  slot: Slot;
  config: AppConfig;
  onClose: () => void;
  onBooked: (slotId: number) => void;
  /** Called when the server says the slot was taken by someone else in the meantime. */
  onTaken: () => void;
}

export function BookingDialog({ slot, config, onClose, onBooked, onTaken }: Props) {
  const [booking, setBooking] = useState<Booking | null>(null);

  return (
    <Modal title={booking ? 'Booking confirmed' : 'Book this slot'} onClose={onClose}>
      <div className="slot-summary">
        <span className="slot-summary-day">{formatDayLong(dayKey(slot.startsAt))}</span>
        <span className="slot-summary-time">
          {formatRange(slot.startsAt, slot.durationMinutes)} · {formatDuration(slot.durationMinutes)}
        </span>
      </div>

      {booking ? (
        <Confirmation booking={booking} config={config} onClose={onClose} />
      ) : (
        <BookingForm
          slot={slot}
          onTaken={onTaken}
          onSuccess={(b) => {
            setBooking(b);
            onBooked(slot.id);
          }}
        />
      )}
    </Modal>
  );
}

function BookingForm({ slot, onSuccess, onTaken }: { slot: Slot; onSuccess: (b: Booking) => void; onTaken: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; taken: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onSuccess(await api.book(slot.id, { name, email, topic: topic || undefined }));
    } catch (err) {
      const taken = err instanceof ApiError && err.status === 409;
      setError({ message: (err as Error).message, taken });
      if (taken) onTaken();
    } finally {
      setSubmitting(false);
    }
  }

  if (error?.taken) {
    return (
      <div className="notice notice-warning" role="alert">
        <strong>This slot was just taken.</strong>
        <p>Someone booked it a moment before you. The list has been refreshed, so pick another time.</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus autoComplete="name" placeholder="Jordan Smith" />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="email" placeholder="jordan@company.com" />
      </label>
      <label className="field">
        <span>
          What would you like to cover? <em>(optional)</em>
        </span>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="e.g. Automating our weekly reporting with ChatGPT"
        />
        <small className="hint">This helps your coach prepare, and personalises your confirmation.</small>
      </label>

      {error && (
        <p className="notice notice-error" role="alert">
          {error.message}
        </p>
      )}

      <button className="btn btn-primary btn-block" disabled={submitting}>
        {submitting ? 'Booking…' : 'Confirm booking'}
      </button>
    </form>
  );
}

function Confirmation({ booking, config, onClose }: { booking: Booking; config: AppConfig; onClose: () => void }) {
  const [message, setMessage] = useState<{ text: string; ai: boolean } | null>(null);

  // The booking is already saved; the AI message streams in separately so it never blocks it.
  useEffect(() => {
    let cancelled = false;
    api
      .confirmationMessage(booking.id)
      .then((r) => !cancelled && setMessage({ text: r.message, ai: r.source === 'ai' }))
      .catch(() => !cancelled && setMessage({ text: `You're all set, ${booking.name}! See you soon.`, ai: false }));
    return () => {
      cancelled = true;
    };
  }, [booking]);

  const [icsUrl] = useState(() =>
    calendarFileUrl({
      startsAt: booking.startsAt,
      durationMinutes: booking.durationMinutes,
      title: `Office hours with ${config.hostName}`,
      description: booking.topic ? `Topic: ${booking.topic}` : 'AI office hours session',
    }),
  );
  useEffect(() => () => URL.revokeObjectURL(icsUrl), [icsUrl]);

  return (
    <div className="confirmation">
      <div className="success-badge" aria-hidden>
        ✓
      </div>
      <h2>You're booked!</h2>
      <p className="muted">
        We've reserved this slot for <strong>{booking.email}</strong>.
        {config.guestInvites && ' A Google Calendar invite is on its way to your inbox.'}
      </p>

      <div className={`ai-message${message ? '' : ' loading'}`} aria-live="polite">
        {message ? (
          <>
            <p>{message.text}</p>
            {message.ai && <span className="ai-tag">✨ Written by Gemini</span>}
          </>
        ) : (
          <>
            <div className="skeleton" />
            <div className="skeleton" style={{ width: '80%' }} />
            <div className="skeleton" style={{ width: '55%' }} />
          </>
        )}
      </div>

      <div className="actions">
        <a className="btn btn-ghost" href={icsUrl} download="office-hours.ics">
          Add to calendar
        </a>
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
