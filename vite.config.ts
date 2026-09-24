import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Local D1/runtime state. Developers use the default persistent `.wrangler/state`;
// automated runs (E2E) point this at their own disposable directory.
const persistPath = process.env.SLEEP_TRACKER_STATE_DIR;

export default defineConfig({
  plugins: [react(), cloudflare(persistPath ? { persistState: { path: persistPath } } : {})],
});
