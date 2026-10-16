import { useState } from 'react';
import { api } from '../api';
import type { AppConfig } from '../types';
import { usePolling } from '../usePolling';
import { ErrorCard, SkeletonCard } from './StatusCards';
import { CalendarStatusNote } from './CalendarStatusNote';
import { CreateSlotsForm } from './CreateSlotsForm';
import { HostSlotList } from './HostSlotList';

export function HostPage({ config }: { config: AppConfig }) {
  const { data: slots, error, refresh } = usePolling(api.hostSlots);
  const [copied, setCopied] = useState(false);

  const booked = slots?.filter((s) => s.booking).length ?? 0;
  const total = slots?.length ?? 0;
  const open = slots?.filter((s) => !s.booking && !s.calendarBusy).length ?? 0;

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <section className="hero hero-host">
        <div>
          <p className="eyebrow">Host dashboard</p>
          <h1>Your office hours</h1>
          <p className="lede">Publish times you're free, {config.hostName.split(',')[0]}. Guests book them from your public page.</p>
          <p className="muted small hero-note">
            {config.aiEnabled
              ? '✨ Guests get a personalised confirmation written by Gemini.'
              : 'AI confirmations are off. Add GEMINI_API_KEY to the API to turn them on.'}
          </p>
          <CalendarStatusNote />
        </div>
        <button className="btn btn-ghost" onClick={copyLink}>
          {copied ? '✓ Link copied' : 'Copy booking link'}
        </button>
      </section>

      {slots && (
        <div className="stats">
          <Stat label="Upcoming slots" value={total} />
          <Stat label="Booked" value={booked} />
          <Stat label="Still open" value={open} />
        </div>
      )}

      <div className="host-grid">
        <CreateSlotsForm onCreated={refresh} />
        <div>
          {error && !slots && <ErrorCard message={error} onRetry={refresh} />}
          {!slots && !error && <SkeletonCard />}
          {slots && <HostSlotList slots={slots} onChanged={refresh} />}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
