import { useEffect, useState } from 'react';
import { api } from './api';
import { BookingPage } from './components/BookingPage';
import { HostPage } from './components/HostPage';
import type { AppConfig } from './types';

type Route = 'book' | 'host';

const readRoute = (): Route => (window.location.hash === '#/host' ? 'host' : 'book');

const FALLBACK_CONFIG: AppConfig = { hostName: 'your coach', timezone: 'Europe/London', aiEnabled: false, calendarEnabled: false, guestInvites: false };

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    api.config().then(setConfig).catch(() => {
      // The pages show their own connection errors; keep the fallback here.
    });
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28">
              <rect width="32" height="32" rx="9" fill="currentColor" />
              <path d="M9 21l7-10 7 10" stroke="white" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          LiftHours
        </a>
        <nav className="tabs" aria-label="Views">
          <a href="#/" className={route === 'book' ? 'tab active' : 'tab'} aria-current={route === 'book' ? 'page' : undefined}>
            Book a session
          </a>
          <a href="#/host" className={route === 'host' ? 'tab active' : 'tab'} aria-current={route === 'host' ? 'page' : undefined}>
            Host dashboard
          </a>
        </nav>
      </header>

      <main className="page">{route === 'book' ? <BookingPage config={config} /> : <HostPage config={config} />}</main>

      <footer className="footer">All times are shown in {config.timezone.replace('_', ' ')} time.</footer>
    </div>
  );
}
