// Central place for runtime settings so the rest of the code never reads process.env directly.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL || undefined,
  pgliteDir: process.env.PGLITE_DIR ?? './.data/pglite',
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true,
  timezone: process.env.APP_TIMEZONE ?? 'Europe/London',
  hostName: process.env.HOST_NAME ?? 'Alex, AI Coach',
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  // Google Calendar clash detection (optional). The key is a service-account JSON key, raw or base64.
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || undefined,
  googleServiceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || undefined,
  // Optional "Connect Google" OAuth client, so events are created as the host and guests get invites.
  googleOauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
  googleOauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
  // Public base URL for OAuth redirects. Render sets RENDER_EXTERNAL_URL automatically.
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, ''),
  seedDemo: process.env.SEED_DEMO !== 'false',
  // Built frontend to serve alongside the API (only present after `npm run build` in frontend/).
  staticDir: process.env.STATIC_DIR ?? '../frontend/dist',
};
