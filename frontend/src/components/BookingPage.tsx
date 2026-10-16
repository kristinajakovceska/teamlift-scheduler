import { useMemo, useState } from 'react';
import { api } from '../api';
import { formatDayLong, formatDuration, formatTime, groupByDay, parseStartsAt, relativeDay } from '../format';
import type { AppConfig, Slot } from '../types';
import { usePolling } from '../usePolling';
import { BookingDialog } from './BookingDialog';
import { ErrorCard, SkeletonCard } from './StatusCards';

export function BookingPage({ config }: { config: AppConfig }) {
  const { data: slots, error, refresh, setData } = usePolling(api.slots);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);

  const days = useMemo(() => groupByDay(slots ?? []), [slots]);
  const freeCount = slots?.filter((s) => !s.isBooked).length ?? 0;

  // Default to the first day that still has something free.
  const selectedDay =
    (pickedDay && days.some(([key]) => key === pickedDay) ? pickedDay : null) ??
    days.find(([, daySlots]) => daySlots.some((s) => !s.isBooked))?.[0] ??
    days[0]?.[0];
  const daySlots = days.find(([key]) => key === selectedDay)?.[1] ?? [];

  const markBooked = (slotId: number) =>
    setData((prev) => prev?.map((s) => (s.id === slotId ? { ...s, isBooked: true } : s)) ?? prev);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">AI Champion office hours</p>
        <h1>Book a 1:1 with {config.hostName}</h1>
        <p className="lede">
          Stuck on a prompt, picking your first AI use case, or getting your team on board? Grab a free slot and we'll
          work through it together.
        </p>
        {slots && (
          <p className="hero-meta">
            <span className="dot" /> {freeCount === 0 ? 'Fully booked right now' : `${freeCount} open slot${freeCount === 1 ? '' : 's'} coming up`}
          </p>
        )}
      </section>

      {error && !slots && <ErrorCard message={error} onRetry={refresh} />}
      {!slots && !error && <SkeletonCard />}

      {slots && days.length === 0 && (
        <div className="card empty">
          <div className="empty-icon" aria-hidden>🗓️</div>
          <h2>No office hours published yet</h2>
          <p>Check back soon. New slots appear here as soon as they're published.</p>
          <a className="btn btn-ghost" href="#/host">
            Are you the host? Publish slots →
          </a>
        </div>
      )}

      {slots && days.length > 0 && (
        <section className="card picker">
          <h2 className="card-title">1. Pick a day</h2>
          <div className="day-strip" role="tablist" aria-label="Days with office hours">
            {days.map(([key, list]) => {
              const free = list.filter((s) => !s.isBooked).length;
              const date = parseStartsAt(`${key}T00:00`);
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={key === selectedDay}
                  className={`day-chip${key === selectedDay ? ' selected' : ''}${free === 0 ? ' full' : ''}`}
                  onClick={() => setPickedDay(key)}
                >
                  <span className="day-name">{relativeDay(key)}</span>
                  <span className="day-num">{date.getDate()}</span>
                  <span className="day-month">{date.toLocaleDateString('en-GB', { month: 'short' })}</span>
                  <span className="day-free">{free === 0 ? 'Full' : `${free} free`}</span>
                </button>
              );
            })}
          </div>

          <h2 className="card-title">2. Choose a time</h2>
          <p className="muted day-heading">{selectedDay && formatDayLong(selectedDay)}</p>
          <ul className="slot-grid">
            {daySlots.map((slot) => (
              <li key={slot.id}>
                <button
                  className={`slot${slot.isBooked ? ' booked' : ''}`}
                  disabled={slot.isBooked}
                  onClick={() => setActiveSlot(slot)}
                  aria-label={`${formatTime(parseStartsAt(slot.startsAt))}, ${formatDuration(slot.durationMinutes)}${slot.isBooked ? ', already booked' : ''}`}
                >
                  <span className="slot-time">{formatTime(parseStartsAt(slot.startsAt))}</span>
                  <span className="slot-meta">{slot.isBooked ? 'Booked' : formatDuration(slot.durationMinutes)}</span>
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="inline-warning">Live updates paused: {error}</p>}
        </section>
      )}

      {activeSlot && (
        <BookingDialog
          slot={activeSlot}
          config={config}
          onClose={() => setActiveSlot(null)}
          onBooked={markBooked}
          onTaken={refresh}
        />
      )}
    </>
  );
}
