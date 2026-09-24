import { cp, mkdtemp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bins, run } from './process.ts';

// State, build output, app process, port and reports belong to this run only.
await mkdir('.test-runs', { recursive: true });
const root = process.cwd();
const directory = await mkdtemp(resolve('.test-runs/run-'));
for (const path of [
  'src',
  'public',
  'migrations',
  'index.html',
  'vite.config.ts',
  'wrangler.jsonc',
  'tsconfig.json',
]) {
  await cp(resolve(root, path), resolve(directory, path), { recursive: true });
}
process.env.SLEEP_TEST_RUN_DIR = directory;
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_LOG_PATH = resolve(directory, 'logs');
process.env.CI = 'true';
process.chdir(directory);
// Exercise the public reset/seed workflow, but only inside this disposable workspace.
await run(resolve(root, 'scripts/database.ts'), ['reset']);
await run(resolve(root, 'scripts/database.ts'), ['seed']);
const { createBuilder, createServer, preview } = await import('vite');
const dev = await createServer({ server: { host: '127.0.0.1', port: 0 } });
try {
  await dev.listen();
  const address = dev.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Dev server did not bind.');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/profiles`);
  const profiles = await response.json();
  if (!response.ok || !Array.isArray(profiles) || profiles.length !== 3)
    throw new Error('Seeded dev API smoke failed.');
} finally {
  await dev.close();
}
const builder = await createBuilder();
await builder.buildApp();
const app = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
const address = app.httpServer.address();
if (!address || typeof address === 'string') throw new Error('App did not bind a port.');
process.env.PLAYWRIGHT_BASE_URL = `http://127.0.0.1:${address.port}`;
try {
  await run(bins.playwright, ['test', '--config', resolve(root, 'playwright.config.ts')]);
} finally {
  await app.close();
}
