import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { todayLocal } from '../src/domain/civil';
import { demoSeedSql } from './demo-data';

/**
 * Local-only D1 helpers. Every command passes `--local`; nothing here can reach remote D1.
 * `stateDir` is a Wrangler/Miniflare persistence directory; omit it for the developer store
 * (`.wrangler/state`, shared with `pnpm dev`).
 */

export const DEVELOPER_STATE_DIR = '.wrangler/state';

const wranglerEnv = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };

function wrangler(args: string[], stateDir: string | undefined, quiet: boolean): void {
  const fullArgs = ['exec', 'wrangler', ...args, '--local', ...(stateDir ? ['--persist-to', stateDir] : [])];
  const result = spawnSync('pnpm', fullArgs, { stdio: quiet ? 'pipe' : 'inherit', env: wranglerEnv, encoding: 'utf8' });
  if (result.status !== 0) {
    if (quiet) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    throw new Error(`wrangler ${args.join(' ')} failed`);
  }
}

export function migrate(stateDir?: string, quiet = false): void {
  wrangler(['d1', 'migrations', 'apply', 'DB'], stateDir, quiet);
}

export function seed(anchor: string = process.env.SEED_ANCHOR ?? todayLocal(), stateDir?: string, quiet = false): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'sleep-tracker-seed-'));
  try {
    const file = path.join(dir, 'seed.sql');
    writeFileSync(file, demoSeedSql(anchor));
    wrangler(['d1', 'execute', 'DB', '--file', file, '--yes'], stateDir, quiet);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Destroy only the local D1 persistence below `stateDir` (the developer store by default). */
export function destroyD1(stateDir: string = DEVELOPER_STATE_DIR): void {
  rmSync(path.join(stateDir, 'v3', 'd1'), { recursive: true, force: true });
}
