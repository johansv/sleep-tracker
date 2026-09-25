import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { unstable_readConfig } from 'wrangler';
import { Temporal } from 'temporal-polyfill';
import { todayLocal } from '../src/domain/civil';
import type { HealthResponse } from '../src/shared/api';
import { demoSeedSql } from './demo-data';
import {
  assertOperationAllowed,
  CI_WORKFLOW_PATH,
  DEFAULT_REMOTE_SEED_ANCHOR,
  DeployError,
  ENVIRONMENT_NAMES,
  ENVIRONMENTS,
  isReusableCiRun,
  isSufficientCiEvidence,
  latestMigration,
  parseEnvironment,
  parseOperation,
  parseRevisionSource,
  PLACEHOLDER_DATABASE_ID,
  publicUrl,
  RELEASE_BRANCH,
  smokeProblems,
  sourceLabel,
  withDatabaseId,
  type CiJob,
  type EnvironmentName,
  type Operation,
} from './remote/policy';

/**
 * Remote Cloudflare operations (`pnpm cf <command> …`). Local use and GitHub Actions both call
 * this; see docs/ARCHITECTURE.md → Remote environments and README → Deploying.
 *
 *   provision <env> [--write]        create the env's D1 database (if missing), report/write its id
 *   doctor <env>                     read-only config/auth/D1 preflight
 *   status <env>                     deployed revision, Worker version and D1 migration state
 *   status-all                       status for all three environments
 *   tail <env>                       live Worker logs (interactive/local)
 *   migrate <env>                    apply committed migrations to the env's remote D1
 *   seed <env> [--anchor date|today] idempotently (re)load demo data            (dev/staging only)
 *   reset <env> --confirm <env> [--seed]  drop all app tables, re-migrate       (dev/staging only)
 *   deploy-only <env> [--source s]   clean build + deploy of HEAD, no migrations
 *   release <env> [--source s]       validation evidence → migrate → clean build + deploy → smoke
 *   smoke <env> [--revision sha]     revision-aware remote health check
 *   evidence [sha]                   is there sufficient green CI for the revision?
 *   resolve <pr|branch> <ref>        exact commit SHA of a PR head / branch tip (GitHub)
 *
 * Every remote command names its environment explicitly; nothing is inferred from the checked-out
 * branch, and nothing here touches the local developer or test D1 stores.
 */

const CONFIG = 'wrangler.jsonc';
const MIGRATIONS_DIR = 'migrations';
const SMOKE_ATTEMPTS = 36;
const SMOKE_INTERVAL_MS = 5_000;

const childEnv = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };

const log = (message: string) => console.log(`[cf] ${message}`);

function run(command: string, args: string[], options: { capture?: boolean; env?: NodeJS.ProcessEnv } = {}): string {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    env: options.env ?? childEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    throw new DeployError(`\`${[command, ...args].join(' ')}\` failed (exit ${result.status ?? 'signal'}).`);
  }
  return result.stdout ?? '';
}

const wrangler = (args: string[], capture = false, env?: NodeJS.ProcessEnv) =>
  run('pnpm', ['exec', 'wrangler', ...args], { capture, env });

/** Remote D1 command against exactly this environment's binding. */
const d1Args = (env: EnvironmentName) => ['DB', '--remote', '--env', env, '-c', CONFIG];

function git(args: string[]): string {
  return run('git', args, { capture: true }).trim();
}

// ---------------------------------------------------------------------------------------------
// Preconditions

function readEnvironmentConfig(env: EnvironmentName) {
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

function requireProvisioned(env: EnvironmentName): string {
  const { databaseId } = readEnvironmentConfig(env);
  if (databaseId === PLACEHOLDER_DATABASE_ID) {
    throw new DeployError(
      `The ${env} D1 database is not configured in ${CONFIG} yet. Run \`pnpm cf provision ${env} --write\` and commit the id.`,
    );
  }
  return databaseId;
}

let authenticated = false;
function requireCloudflareAuth(): void {
  if (authenticated) return;
  const result = spawnSync('pnpm', ['exec', 'wrangler', 'whoami', '--json'], { env: childEnv, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new DeployError(
      'Cloudflare authentication is missing. Locally run `pnpm exec wrangler login`; in CI set the CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets.',
    );
  }
  authenticated = true;
}

function currentRevision(expected: string | undefined): string {
  if (git(['status', '--porcelain', '--untracked-files=normal'])) {
    throw new DeployError('The working tree has uncommitted changes. Deploy only committed revisions.');
  }
  const sha = git(['rev-parse', 'HEAD']);
  if (expected && expected !== sha) throw new DeployError(`HEAD is ${sha}, expected ${expected}.`);
  return sha;
}

function requireReleaseBranchRevision(sha: string): void {
  git(['fetch', '--quiet', 'origin', `+refs/heads/${RELEASE_BRANCH}:refs/remotes/origin/${RELEASE_BRANCH}`]);
  const onMain = spawnSync('git', ['merge-base', '--is-ancestor', sha, `origin/${RELEASE_BRANCH}`]).status === 0;
  if (!onMain) throw new DeployError(`Production only takes revisions from ${RELEASE_BRANCH}; ${sha} is not on it.`);
}

function defaultSource(): string {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return branch === 'HEAD' ? 'local' : `local:${branch}`;
}

// ---------------------------------------------------------------------------------------------
// GitHub (validation evidence, revision resolution)

function githubRepository(): string | null {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const origin = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout?.trim() ?? '';
  return /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(origin)?.[1] ?? null;
}

function githubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const gh = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
  return gh.status === 0 ? gh.stdout.trim() : undefined;
}

async function github<T>(apiPath: string): Promise<{ status: number; body: T }> {
  const repository = githubRepository();
  if (!repository) throw new DeployError('Cannot tell which GitHub repository this is (set GITHUB_REPOSITORY).');
  const token = githubToken();
  const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: response.status, body: (await response.json()) as T };
}

/** URL of a successful CI run for exactly `sha` in which every required job passed, if any. */
async function findCiEvidence(sha: string): Promise<string | null> {
  try {
    const workflow = path.basename(CI_WORKFLOW_PATH);
    const runs = await github<{
      workflow_runs?: Array<{ id: number; html_url: string; event: string; head_sha: string }>;
    }>(`/actions/workflows/${workflow}/runs?head_sha=${sha}&status=success&per_page=20`);
    if (runs.status !== 200) {
      log(`Could not read CI runs from GitHub (HTTP ${runs.status}).`);
      return null;
    }
    for (const ciRun of runs.body.workflow_runs ?? []) {
      if (!isReusableCiRun(ciRun, sha)) continue;
      const jobs = await github<{ jobs?: CiJob[] }>(`/actions/runs/${ciRun.id}/jobs?per_page=100`);
      if (jobs.status === 200 && isSufficientCiEvidence(jobs.body.jobs ?? [])) return ciRun.html_url;
    }
  } catch (error) {
    log(`Could not look up CI evidence: ${error instanceof Error ? error.message : String(error)}`);
  }
  return null;
}

async function requireValidationEvidence(sha: string): Promise<string> {
  const evidence = await findCiEvidence(sha);
  if (evidence) {
    log(`Validation evidence for ${sha}: ${evidence}`);
    return evidence;
  }
  log(`No complete green CI run found for ${sha}; running \`pnpm verify\` on it before deploying.`);
  // Tests never see deployment credentials; they only use local, disposable D1 state.
  const testEnv = Object.fromEntries(
    Object.entries(childEnv).filter(([key]) => !/^(CLOUDFLARE_|CF_ACCESS_)/.test(key)),
  );
  run('pnpm', ['verify'], { env: testEnv });
  return 'pnpm verify (this run)';
}

// ---------------------------------------------------------------------------------------------
// Operations

function migrate(env: EnvironmentName): void {
  requireProvisioned(env);
  requireCloudflareAuth();
  log(`Applying migrations to ${ENVIRONMENTS[env].database} (${env})…`);
  wrangler(['d1', 'migrations', 'apply', ...d1Args(env)]);
}

function remoteSeedAnchor(value: string | undefined): string {
  const requested = value ?? process.env.SEED_ANCHOR ?? DEFAULT_REMOTE_SEED_ANCHOR;
  if (requested === 'today') return todayLocal();
  try {
    return Temporal.PlainDate.from(requested).toString();
  } catch {
    throw new DeployError(
      `Invalid seed anchor "${requested}". Use YYYY-MM-DD or "today" (default: ${DEFAULT_REMOTE_SEED_ANCHOR}).`,
    );
  }
}

function seed(env: EnvironmentName, anchorValue?: string): void {
  assertOperationAllowed('seed', env);
  requireProvisioned(env);
  requireCloudflareAuth();
  const anchor = remoteSeedAnchor(anchorValue);
  const dir = mkdtempSync(path.join(tmpdir(), 'sleep-tracker-seed-'));
  try {
    const file = path.join(dir, 'seed.sql');
    writeFileSync(file, demoSeedSql(anchor));
    log(`Seeding demo data anchored at ${anchor} into ${ENVIRONMENTS[env].database} (${env})…`);
    wrangler(['d1', 'execute', ...d1Args(env), '--file', file, '--yes']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function reset(env: EnvironmentName, confirm: string | undefined, andSeed: boolean, seedAnchor?: string): void {
  assertOperationAllowed('reset', env);
  const databaseId = requireProvisioned(env);
  if (confirm !== env) {
    throw new DeployError(`Reset destroys all ${env} data. Repeat the environment to confirm: --confirm ${env}`);
  }
  requireCloudflareAuth();
  log(`DESTRUCTIVE: dropping every table in D1 ${ENVIRONMENTS[env].database} (${databaseId}) of ${env}.`);
  const listing = wrangler(
    [
      'd1',
      'execute',
      ...d1Args(env),
      '--json',
      '--command',
      "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view') AND substr(name, 1, 7) <> 'sqlite_' AND substr(name, 1, 4) <> '_cf_'",
    ],
    true,
  );
  const rows = (
    JSON.parse(listing.slice(listing.indexOf('['))) as Array<{ results: Array<{ type: string; name: string }> }>
  )[0]?.results;
  if (!rows) throw new DeployError('Could not list the tables to reset.');
  if (rows.length > 0) {
    const drops = rows
      .reverse()
      .map((row) => `DROP ${row.type === 'view' ? 'VIEW' : 'TABLE'} IF EXISTS "${row.name.replaceAll('"', '""')}";`);
    wrangler([
      'd1',
      'execute',
      ...d1Args(env),
      '--yes',
      '--command',
      ['PRAGMA defer_foreign_keys = on;', ...drops].join(' '),
    ]);
  }
  migrate(env);
  if (andSeed) seed(env, seedAnchor);
}

function doctor(env: EnvironmentName): void {
  const { worker, database } = ENVIRONMENTS[env];
  const { databaseId } = readEnvironmentConfig(env);
  log(`Doctor ${env}: Worker ${worker} · D1 ${database} · ${publicUrl(env)}`);
  if (databaseId === PLACEHOLDER_DATABASE_ID) {
    throw new DeployError(
      `${env} is not provisioned in ${CONFIG}. Run \`pnpm cf provision ${env} --write\` locally, or provision in GitHub and commit the reported id.`,
    );
  }
  requireCloudflareAuth();
  wrangler(['d1', 'migrations', 'list', ...d1Args(env)]);
  log(`Doctor passed for ${env}: config, credentials and D1 binding are usable.`);
}

function tail(env: EnvironmentName): void {
  requireCloudflareAuth();
  log(`Tailing ${ENVIRONMENTS[env].worker}; press Ctrl-C to stop.`);
  wrangler(['tail', ENVIRONMENTS[env].worker, '--format', 'pretty']);
}

async function provision(env: EnvironmentName, write: boolean): Promise<void> {
  const { database } = ENVIRONMENTS[env];
  const list = () =>
    JSON.parse(wrangler(['d1', 'list', '--json'], true).replace(/^[^[]*/, '')) as Array<{ uuid: string; name: string }>;
  let found = list().find((d) => d.name === database);
  if (found) log(`D1 database ${database} already exists (${found.uuid}).`);
  else {
    log(`Creating D1 database ${database}…`);
    wrangler(['d1', 'create', database]);
    found = list().find((d) => d.name === database);
    if (!found) throw new DeployError(`Created ${database} but cannot find it in \`wrangler d1 list\`.`);
  }

  const configured = readEnvironmentConfig(env).databaseId;
  if (configured === found.uuid) {
    log(`${CONFIG} env.${env} already binds DB to ${found.uuid}. Next: \`pnpm cf migrate ${env}\`.`);
    return;
  }
  const delta = `In ${CONFIG}, set env.${env}.d1_databases[DB].database_id to "${found.uuid}" (currently "${configured}").`;
  if (write) {
    writeFileSync(CONFIG, withDatabaseId(readFileSync(CONFIG, 'utf8'), env, found.uuid));
    log(`Updated ${CONFIG}. Commit it, then run \`pnpm cf migrate ${env}\` or \`pnpm cf release ${env}\`.`);
  } else {
    log(`${delta} Commit that change (or rerun with --write) before migrating/deploying.`);
  }
  summary([`### Provisioned ${env}`, '', delta, '', `Database: \`${database}\` / \`${found.uuid}\``]);
}

function build(env: EnvironmentName): string {
  const outDir = path.join('.deploy', env);
  rmSync(outDir, { recursive: true, force: true });
  log(`Clean ${env} build into ${outDir}…`);
  run('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--logLevel', 'warn'], {
    env: { ...childEnv, CLOUDFLARE_ENV: env },
  });
  // The Vite plugin points `wrangler deploy` at the last build; deploys here always pass -c.
  rmSync(path.join('.wrangler', 'deploy', 'config.json'), { force: true });

  const workerDir = readdirSync(outDir).find((d) => existsSync(path.join(outDir, d, 'wrangler.json')));
  if (!workerDir) throw new DeployError(`The build in ${outDir} has no Worker output.`);
  const configPath = path.join(outDir, workerDir, 'wrangler.json');
  const built = JSON.parse(readFileSync(configPath, 'utf8')) as {
    name: string;
    vars?: Record<string, unknown>;
    d1_databases?: Array<{ binding: string; database_name: string }>;
  };
  const db = built.d1_databases?.find((d) => d.binding === 'DB');
  if (
    built.name !== ENVIRONMENTS[env].worker ||
    built.vars?.APP_ENV !== env ||
    db?.database_name !== ENVIRONMENTS[env].database
  ) {
    throw new DeployError(`The build in ${outDir} is not configured for ${env}; refusing to deploy it.`);
  }
  return configPath;
}

function deploy(
  env: EnvironmentName,
  configPath: string,
  sha: string,
  source: string,
  operation: Operation,
): string | null {
  const outputFile = path.join(mkdtempSync(path.join(tmpdir(), 'sleep-tracker-deploy-')), 'wrangler-output.ndjson');
  log(`Deploying ${sha} (${source}) to ${ENVIRONMENTS[env].worker}…`);
  wrangler(
    [
      'deploy',
      '-c',
      configPath,
      '--var',
      `APP_REVISION:${sha}`,
      '--var',
      `APP_SOURCE:${source}`,
      '--tag',
      sha.slice(0, 12),
      '--message',
      `${operation} ${source} ${sha}`.slice(0, 100),
    ],
    false,
    { ...childEnv, WRANGLER_OUTPUT_FILE_PATH: outputFile },
  );
  const entries = existsSync(outputFile)
    ? readFileSync(outputFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { type?: string; version_id?: string | null })
    : [];
  rmSync(path.dirname(outputFile), { recursive: true, force: true });
  return entries.find((e) => e.type === 'deploy')?.version_id ?? null;
}

function accessHeaders(): Record<string, string> {
  const { CF_ACCESS_CLIENT_ID: id, CF_ACCESS_CLIENT_SECRET: secret } = process.env;
  return id && secret ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret } : {};
}

async function fetchHealth(env: EnvironmentName): Promise<HealthResponse> {
  const response = await fetch(`${publicUrl(env)}/api/health`, { headers: accessHeaders(), redirect: 'manual' });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`HTTP ${response.status} without a health payload`);
  }
  return (await response.json()) as HealthResponse;
}

async function smoke(env: EnvironmentName, revision: string, requireMigrated: boolean): Promise<HealthResponse> {
  const expected = { environment: env, revision, latestMigration: requireMigrated ? repoLatestMigration() : null };
  let problems: string[] = [];
  for (let attempt = 1; attempt <= SMOKE_ATTEMPTS; attempt++) {
    try {
      const health = await fetchHealth(env);
      problems = smokeProblems(health, expected);
      if (problems.length === 0) {
        const page = await fetch(publicUrl(env), { headers: accessHeaders() });
        if (page.ok && page.headers.get('content-type')?.includes('text/html')) {
          log(`Smoke check passed: ${publicUrl(env)} runs ${revision} on ${env}.`);
          return health;
        }
        problems = [`the app page returned HTTP ${page.status}`];
      }
    } catch (error) {
      problems = [error instanceof Error ? error.message : String(error)];
    }
    if (attempt < SMOKE_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, SMOKE_INTERVAL_MS));
  }
  throw new DeployError(
    `Smoke check FAILED for ${env} (${publicUrl(env)}), revision ${revision}: ${problems.join('; ')}.`,
  );
}

function repoLatestMigration(): string | null {
  return latestMigration(readdirSync(MIGRATIONS_DIR));
}

async function deployRevision(
  env: EnvironmentName,
  operation: 'release' | 'deploy-only',
  options: { source?: string; expectRevision?: string },
): Promise<void> {
  assertOperationAllowed(operation, env);
  const sha = currentRevision(options.expectRevision);
  const source = options.source ?? defaultSource();
  if (env === 'production') requireReleaseBranchRevision(sha);
  requireProvisioned(env);
  requireCloudflareAuth();
  log(`${operation} ${env}: revision ${sha} (${source}) → ${publicUrl(env)}`);

  output({ environment: env, url: publicUrl(env), source, sha });
  let evidence = 'not required (deploy-only)';
  let versionId: string | null = null;
  try {
    // A failed validation or migration stops here, before any code is deployed.
    if (operation === 'release') {
      evidence = await requireValidationEvidence(sha);
      migrate(env);
    } else log('deploy-only: migrations are NOT applied.');
    versionId = deploy(env, build(env), sha, source, operation);
    output({ version_id: versionId ?? '' });
    versionId = (await smoke(env, sha, operation === 'release')).workerVersion?.id ?? versionId;
  } catch (error) {
    summary([
      `### ❌ ${operation} ${env} failed`,
      '',
      `Revision \`${sha}\` (${source}) → ${publicUrl(env)}`,
      versionId ? `Deployed Worker version ${versionId} did not pass the smoke check.` : 'Nothing was deployed.',
    ]);
    throw error;
  }

  const rows: Array<[string, string]> = [
    ['Environment', env],
    ['URL', publicUrl(env)],
    ['Source', source],
    ['Revision', sha],
    ['Worker version', versionId ?? 'unknown'],
    ['Validation', evidence],
  ];
  for (const [key, value] of rows) log(`${key.padEnd(15)} ${value}`);
  summary([`### ✅ ${operation} ${env}`, '', '| | |', '| --- | --- |', ...rows.map(([k, v]) => `| ${k} | ${v} |`)]);
  output({ version_id: versionId ?? '' });
}

async function statusAll(): Promise<boolean> {
  let healthy = true;
  for (const env of ENVIRONMENT_NAMES) {
    try {
      if (!(await status(env))) healthy = false;
    } catch (error) {
      healthy = false;
      log(`${env}: status failed (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return healthy;
}

async function status(env: EnvironmentName): Promise<boolean> {
  const { worker, database } = ENVIRONMENTS[env];
  log(`${env}: ${publicUrl(env)} · Worker ${worker} · D1 ${database} (${readEnvironmentConfig(env).databaseId})`);
  let healthy = false;
  try {
    const health = await fetchHealth(env);
    healthy = health.ok && health.environment === env;
    log(`Health:          ${health.ok ? 'ok' : 'FAILING'} (environment ${health.environment})`);
    log(`Revision:        ${health.revision ?? 'unknown'} (${health.source ?? 'unknown source'})`);
    log(
      `Worker version:  ${health.workerVersion ? `${health.workerVersion.id} (${health.workerVersion.timestamp})` : 'unknown'}`,
    );
    log(
      `Latest applied migration: ${health.database.latestMigration ?? 'none'} (repository: ${repoLatestMigration()})`,
    );
  } catch (error) {
    log(`Health: unreachable (${error instanceof Error ? error.message : String(error)})`);
  }
  requireCloudflareAuth();
  log('Active deployment:');
  wrangler(['deployments', 'status', '--name', worker]);
  if (readEnvironmentConfig(env).databaseId !== PLACEHOLDER_DATABASE_ID) {
    log('Pending migrations:');
    wrangler(['d1', 'migrations', 'list', ...d1Args(env)]);
  }
  return healthy;
}

async function resolve(kind: string | undefined, ref: string | undefined): Promise<void> {
  const source = parseRevisionSource(kind, ref);
  let sha: string | undefined;
  if (source.kind === 'pr') {
    const pr = await github<{ state?: string; head?: { sha: string } }>(`/pulls/${source.number}`);
    if (pr.status !== 200 || !pr.body.head) throw new DeployError(`Pull request #${source.number} cannot be resolved.`);
    if (pr.body.state !== 'open')
      throw new DeployError(`Pull request #${source.number} is ${pr.body.state}, not open.`);
    sha = pr.body.head.sha;
  } else {
    const branch = await github<{ commit?: { sha: string } }>(`/branches/${encodeURIComponent(source.name)}`);
    if (branch.status !== 200 || !branch.body.commit)
      throw new DeployError(`Branch "${source.name}" cannot be resolved.`);
    sha = branch.body.commit.sha;
  }
  log(`${sourceLabel(source)} → ${sha}`);
  output({ sha, source: sourceLabel(source), pr: source.kind === 'pr' ? String(source.number) : '0' });
}

// ---------------------------------------------------------------------------------------------
// GitHub Actions reporting (no-ops locally)

function summary(lines: string[]): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n\n`);
}

function output(values: Record<string, string>): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(''),
  );
}

// ---------------------------------------------------------------------------------------------

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      source: { type: 'string' },
      'expect-revision': { type: 'string' },
      revision: { type: 'string' },
      confirm: { type: 'string' },
      seed: { type: 'boolean', default: false },
      write: { type: 'boolean', default: false },
      anchor: { type: 'string' },
    },
  });
  const [command, arg1, arg2] = positionals;

  if (!command || command === 'help') {
    console.log(`Usage: pnpm cf <command> [environment]

Happy path:
  pnpm cf doctor staging
  pnpm cf release staging
  pnpm cf status staging

Commands:
  provision <env> [--write]
  doctor <env>
  status <env> | status-all
  tail <env>
  migrate <env>
  seed <env> [--anchor YYYY-MM-DD|today]
  reset <env> --confirm <env> [--seed] [--anchor YYYY-MM-DD|today]
  deploy-only <env>
  release <env>
  smoke <env>
`);
    return 0;
  }
  if (command === 'status-all') return (await statusAll()) ? 0 : 1;

  if (command === 'evidence') {
    const sha = arg1 ?? git(['rev-parse', 'HEAD']);
    const evidence = await findCiEvidence(sha);
    log(evidence ? `Sufficient CI evidence for ${sha}: ${evidence}` : `No sufficient CI evidence for ${sha}.`);
    output({ found: evidence ? 'true' : 'false', url: evidence ?? '' });
    return 0;
  }
  if (command === 'resolve') {
    await resolve(arg1, arg2);
    return 0;
  }

  const operation = parseOperation(command);
  const env = parseEnvironment(arg1);
  assertOperationAllowed(operation, env);
  switch (operation) {
    case 'provision':
      requireCloudflareAuth();
      await provision(env, values.write);
      return 0;
    case 'doctor':
      doctor(env);
      return 0;
    case 'status':
      return (await status(env)) ? 0 : 1;
    case 'tail':
      tail(env);
      return 0;
    case 'migrate':
      migrate(env);
      return 0;
    case 'seed':
      seed(env, values.anchor);
      return 0;
    case 'reset':
      reset(env, values.confirm, values.seed, values.anchor);
      return 0;
    case 'deploy-only':
    case 'release':
      await deployRevision(env, operation, { source: values.source, expectRevision: values['expect-revision'] });
      return 0;
    case 'smoke':
      await smoke(env, values.revision ?? git(['rev-parse', 'HEAD']), false);
      return 0;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`[cf] ${error instanceof DeployError ? error.message : String(error)}`);
    if (!(error instanceof DeployError)) console.error(error);
    process.exit(1);
  },
);
