import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedSQL } from './fixtures.ts';
import { bins, run } from './process.ts';

export async function prepareDatabase(state: string, seed = true) {
  const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
  await mkdir(state, { recursive: true });
  await run(
    bins.wrangler,
    [
      'd1',
      'migrations',
      'apply',
      'DB',
      '--config',
      resolve('wrangler.jsonc'),
      '--local',
      '--persist-to',
      state,
    ],
    env,
  );
  if (seed) {
    const path = resolve(state, 'seed.sql');
    await writeFile(path, seedSQL());
    await run(
      bins.wrangler,
      [
        'd1',
        'execute',
        'DB',
        '--config',
        resolve('wrangler.jsonc'),
        '--local',
        '--persist-to',
        state,
        '--file',
        path,
        '--yes',
      ],
      env,
      true,
    );
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (!['migrate', 'seed', 'reset'].includes(command))
    throw new Error('Use migrate, seed, or reset.');
  const root = resolve('.local');
  const state = resolve(root, 'state');
  if (!state.startsWith(root + sep) || state !== resolve('.local/state'))
    throw new Error('Unsafe reset path.');
  if (command === 'reset') await rm(state, { recursive: true, force: true });
  await prepareDatabase(state, command !== 'migrate');
}
