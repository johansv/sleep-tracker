import { spawnSync } from 'node:child_process';
import { unstable_readConfig } from 'wrangler';
import { pnpm } from '../pnpm';
import { DeployError, ENVIRONMENTS, PLACEHOLDER_DATABASE_ID, type EnvironmentName } from './policy';

/**
 * Process/Wrangler plumbing shared by the remote commands (`pnpm cf`, `pnpm auth`). Every D1
 * command here is `--remote --env <env>` against exactly one named environment.
 */

export const CONFIG = 'wrangler.jsonc';

export const childEnv = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };

export function run(
  command: string,
  args: string[],
  options: { capture?: boolean; env?: NodeJS.ProcessEnv; input?: string } = {},
): string {
  const result = spawnSync(command, args, {
    stdio: options.capture || options.input !== undefined ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input: options.input,
    env: options.env ?? childEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    const detail = result.error ? result.error.message : `exit ${result.status ?? 'signal'}`;
    throw new DeployError(`\`${[command, ...args].join(' ')}\` failed (${detail}).`);
  }
  return result.stdout ?? '';
}

export const runPnpm = (args: string[], options: { capture?: boolean; env?: NodeJS.ProcessEnv } = {}) =>
  run(...pnpm(args), options);

export const wrangler = (args: string[], capture = false, env?: NodeJS.ProcessEnv) =>
  runPnpm(['exec', 'wrangler', ...args], { capture, env });

/** Remote D1 command against exactly this environment's binding. */
export const d1Args = (env: EnvironmentName) => ['DB', '--remote', '--env', env, '-c', CONFIG];

/** Rows of a single read-only statement against the environment's remote D1. */
export function d1Query<T>(env: EnvironmentName, sql: string): T[] {
  const output = wrangler(['d1', 'execute', ...d1Args(env), '--json', '--command', sql], true);
  const parsed = JSON.parse(output.slice(output.indexOf('['))) as Array<{ results: T[] }>;
  const rows = parsed[0]?.results;
  if (!rows) throw new DeployError(`Unexpected D1 response for: ${sql}`);
  return rows;
}

export function git(args: string[]): string {
  return run('git', args, { capture: true }).trim();
}

export function readEnvironmentConfig(env: EnvironmentName) {
  const config = unstable_readConfig({ config: CONFIG, env });
  const database = config.d1_databases.find((d: { binding: string }) => d.binding === 'DB') as
    { database_name?: string; database_id?: string } | undefined;
  const expected = ENVIRONMENTS[env];
  if (config.name !== expected.worker || database?.database_name !== expected.database || config.vars.APP_ENV !== env) {
    throw new DeployError(
      `${CONFIG} env.${env} does not match the expected Worker "${expected.worker}", D1 "${expected.database}" and APP_ENV "${env}".`,
    );
  }
  return { databaseId: database.database_id ?? PLACEHOLDER_DATABASE_ID };
}

export function requireProvisioned(env: EnvironmentName): string {
  const { databaseId } = readEnvironmentConfig(env);
  if (databaseId === PLACEHOLDER_DATABASE_ID) {
    throw new DeployError(
      `The ${env} D1 database is not configured in ${CONFIG} yet. Run \`pnpm cf provision ${env} --write\` locally and commit the id.`,
    );
  }
  return databaseId;
}

let authenticated = false;
export function requireCloudflareAuth(): void {
  if (authenticated) return;
  const result = spawnSync(...pnpm(['exec', 'wrangler', 'whoami', '--json']), { env: childEnv, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new DeployError(
      'Cloudflare authentication is missing. Locally run `pnpm exec wrangler login`; in CI set the CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets.',
    );
  }
  authenticated = true;
}

/** Whether the environment's D1 holds an application password (false if the table is missing). */
export function passwordConfigured(env: EnvironmentName): boolean {
  try {
    return d1Query<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM auth_password')[0]?.n === 1;
  } catch {
    return false;
  }
}
