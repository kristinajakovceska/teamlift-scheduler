import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev, the frontend calls /api and Vite forwards it to the NestJS server.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
