import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { migrate, seed } from './local-d1';

/**
 * Self-contained E2E run (`pnpm test:e2e [playwright args]`):
 *   1. create a disposable, per-run D1 state directory under .e2e-state/ (git-ignored),
 *   2. apply migrations and load the deterministic demo data at a fixed anchor date,
 *   3. build the app into that directory,
 *   4. run Playwright, which serves that build with `wrangler dev` (local Workers runtime) against
 *      that state on free ports, and finally remove the directory.
 * The build is served straight from its own output config rather than via `vite preview`, which
 * resolves the build through a single project-wide redirect file that parallel runs would share.
 * It never reads or writes the developer store (.wrangler/state) and needs no running server,
 * so repeated and parallel runs are safe.
 */

export const E2E_ANCHOR = '2026-09-24';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

const runId = `${Date.now()}-${process.pid}`;
const stateDir = path.resolve('.e2e-state', runId);
const outDir = path.join(stateDir, 'dist');
const keep = process.env.E2E_KEEP_STATE === '1';

let status = 1;
try {
  mkdirSync(stateDir, { recursive: true });
  console.log(`E2E state: ${path.relative(process.cwd(), stateDir)}`);
  migrate(stateDir, true);
  seed(E2E_ANCHOR, stateDir, true);

  const env = { ...process.env, SLEEP_TRACKER_STATE_DIR: stateDir };
  const build = spawnSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--logLevel', 'warn'], {
    stdio: 'inherit',
    env,
  });
  if (build.status !== 0) throw new Error('Build failed');

  const [port, inspectorPort] = [await freePort(), await freePort()];
  const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      ...env,
      E2E_PORT: String(port),
      E2E_INSPECTOR_PORT: String(inspectorPort),
      E2E_OUT_DIR: outDir,
      E2E_RUN_ID: runId,
      E2E_ANCHOR,
    },
  });
  status = result.status ?? 1;
} catch (error) {
  console.error(error);
} finally {
  if (keep) console.log(`Kept E2E state in ${stateDir}`);
  else rmSync(stateDir, { recursive: true, force: true });
  // Don't leave the Vite plugin's deploy redirect pointing at this disposable build.
  const redirect = '.wrangler/deploy/config.json';
  if (!keep && existsSync(redirect) && readFileSync(redirect, 'utf8').includes(runId)) rmSync(redirect);
}
process.exit(status);
