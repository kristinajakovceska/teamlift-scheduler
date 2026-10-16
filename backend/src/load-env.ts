// Imported first in main.ts so .env is loaded before config.ts reads process.env.
// process.loadEnvFile is built into Node >= 20.12, so no dotenv dependency is needed.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on real environment variables (e.g. on Render).
}
