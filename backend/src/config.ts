// Central place for runtime settings so the rest of the code never reads process.env directly.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL || undefined,
  pgliteDir: process.env.PGLITE_DIR ?? './.data/pglite',
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true,
  timezone: process.env.APP_TIMEZONE ?? 'Europe/London',
  hostName: process.env.HOST_NAME ?? 'Alex, AI Coach',
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  seedDemo: process.env.SEED_DEMO !== 'false',
};
