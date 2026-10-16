import { type FormEvent, useState } from 'react';
import { api } from '../api';
import { addMinutes, formatDayLong, formatTime, toDayKey } from '../format';

const DURATIONS = [15, 20, 30, 45, 60, 90];

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDayKey(d);
};

export function CreateSlotsForm({ onCreated }: { onCreated: () => void }) {
  const [date, setDate] = useState(tomorrow);
  const [startTime, setStartTime] = useState('10:00');
  const [durationMinutes, setDuration] = useState(30);
  const [count, setCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Live preview of exactly which slots will be published.
  const preview =
    date && startTime
      ? Array.from({ length: count }, (_, i) => formatTime(addMinutes(`${date}T${startTime}`, i * durationMinutes)))
      : [];
  const endsAt = date && startTime ? formatTime(addMinutes(`${date}T${startTime}`, count * durationMinutes)) : '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const created = await api.createSlots({ date, startTime, durationMinutes, count });
      setFeedback({ kind: 'success', text: `Published ${created.length} slot${created.length === 1 ? '' : 's'} on ${formatDayLong(date)}.` });
      onCreated();
    } catch (err) {
      setFeedback({ kind: 'error', text: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form create-form" onSubmit={submit}>
      <h2 className="card-title">Publish availability</h2>

      <label className="field">
        <span>Date</span>
        <input type="date" value={date} min={toDayKey(new Date())} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Start time</span>
          <input type="time" value={startTime} step={300} onChange={(e) => setStartTime(e.target.value)} required />
        </label>
        <label className="field">
          <span>Duration</span>
          <select value={durationMinutes} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Back-to-back slots</span>
        <div className="stepper">
          <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} aria-label="Fewer slots">
            −
          </button>
          <output aria-live="polite">{count}</output>
          <button type="button" onClick={() => setCount((c) => Math.min(12, c + 1))} disabled={count >= 12} aria-label="More slots">
            +
          </button>
        </div>
        <small className="hint">Block out an afternoon in one go, e.g. 4 × 30 min.</small>
      </label>

      {preview.length > 0 && (
        <div className="preview">
          <span className="preview-label">
            Will publish {count} slot{count === 1 ? '' : 's'}, {preview[0]} – {endsAt}
          </span>
          <div className="preview-chips">
            {preview.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <p className={`notice notice-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.text}
        </p>
      )}

      <button className="btn btn-primary btn-block" disabled={submitting}>
        {submitting ? 'Publishing…' : count === 1 ? 'Publish slot' : `Publish ${count} slots`}
      </button>
    </form>
  );
}
