import type { HealthResponse } from '../../src/shared/api';

/**
 * Pure rules for the remote Cloudflare environments, shared by `pnpm cf` (scripts/cloudflare.ts)
 * and its tests. wrangler.jsonc is the source of truth for the actual Worker/D1 configuration;
 * this table only names what the tooling expects and a unit test keeps the two in sync.
 */

export const ENVIRONMENTS = {
  dev: { hostname: 'sleep-dev.jscodelab.uk', worker: 'sleep-tracker-dev', database: 'sleep-tracker-dev' },
  staging: {
    hostname: 'sleep-staging.jscodelab.uk',
    worker: 'sleep-tracker-staging',
    database: 'sleep-tracker-staging',
  },
  production: {
    hostname: 'sleep.jscodelab.uk',
    worker: 'sleep-tracker-production',
    database: 'sleep-tracker-production',
  },
} as const;

export type EnvironmentName = keyof typeof ENVIRONMENTS;
export const ENVIRONMENT_NAMES = Object.keys(ENVIRONMENTS) as EnvironmentName[];

export const OPERATIONS = [
  'provision',
  'doctor',
  'status',
  'tail',
  'migrate',
  'seed',
  'reset',
  'deploy-only',
  'release',
  'smoke',
] as const;
export type Operation = (typeof OPERATIONS)[number];

/** Demo data and destructive resets never reach production through this command surface. */
const FORBIDDEN: Record<EnvironmentName, readonly Operation[]> = {
  dev: [],
  staging: [],
  production: ['seed', 'reset'],
};

/** The all-zero id in wrangler.jsonc marks an environment whose D1 database is not provisioned. */
export const PLACEHOLDER_DATABASE_ID = '00000000-0000-0000-0000-000000000000';

/** Stable default for remote demo data; pass --anchor today for an intentionally moving dataset. */
export const DEFAULT_REMOTE_SEED_ANCHOR = '2026-09-24';

/** The branch production revisions must come from. */
export const RELEASE_BRANCH = 'main';

/** CI jobs (names in .github/workflows/ci.yml) that together are release validation evidence. */
export const REQUIRED_CI_JOBS = ['Fast gate', 'Integration & browser E2E'] as const;
export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';

export class DeployError extends Error {}

export function parseEnvironment(value: string | undefined): EnvironmentName {
  if (value && Object.hasOwn(ENVIRONMENTS, value)) return value as EnvironmentName;
  throw new DeployError(
    `${value ? `Unknown environment "${value}"` : 'No environment given'}. Expected one of: ${ENVIRONMENT_NAMES.join(', ')}.`,
  );
}

export function parseOperation(value: string | undefined): Operation {
  if (value && (OPERATIONS as readonly string[]).includes(value)) return value as Operation;
  throw new DeployError(
    `${value ? `Unknown operation "${value}"` : 'No operation given'}. Expected one of: ${OPERATIONS.join(', ')}.`,
  );
}

export function isOperationAllowed(operation: Operation, env: EnvironmentName): boolean {
  return !FORBIDDEN[env].includes(operation);
}

export function assertOperationAllowed(operation: Operation, env: EnvironmentName): void {
  if (!isOperationAllowed(operation, env)) {
    throw new DeployError(`"${operation}" is not allowed for ${env}: demo data and resets never touch ${env}.`);
  }
}

export function publicUrl(env: EnvironmentName): string {
  return `https://${ENVIRONMENTS[env].hostname}`;
}

/** Newest migration file name, which Wrangler records in `d1_migrations` once applied. */
export function latestMigration(files: readonly string[]): string | null {
  return (
    files
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort()
      .at(-1) ?? null
  );
}

export interface SmokeExpectation {
  environment: EnvironmentName;
  revision: string;
  /** Required after a release (migrations ran); null skips the check (deploy-only). */
  latestMigration: string | null;
}

/** Problems with a deployed health response; empty means the smoke check passed. */
export function smokeProblems(health: HealthResponse, expected: SmokeExpectation): string[] {
  const problems: string[] = [];
  if (health.environment !== expected.environment) {
    problems.push(`environment is "${health.environment}", expected "${expected.environment}"`);
  }
  if (health.revision !== expected.revision) {
    problems.push(`revision is ${health.revision ?? 'unknown'}, expected ${expected.revision}`);
  }
  if (!health.ok || !health.database.ok) problems.push('the Worker cannot reach its D1 database');
  else if (expected.latestMigration && health.database.latestMigration !== expected.latestMigration) {
    problems.push(
      `D1 reports latest migration ${health.database.latestMigration ?? 'none'}, expected ${expected.latestMigration}`,
    );
  }
  return problems;
}

export interface CiJob {
  name: string;
  conclusion: string | null;
}

export interface CiWorkflowRun {
  event: string;
  head_sha: string;
}

/**
 * pull_request CI checks out GitHub's synthetic merge ref by default, so it is integration evidence,
 * not exact-head evidence. Only a push run for the exact SHA may be reused by a release.
 */
export function isReusableCiRun(run: CiWorkflowRun, sha: string): boolean {
  return run.event === 'push' && run.head_sha === sha;
}

/**
 * A CI run is release evidence only when every required job succeeded. A run where browser E2E
 * was skipped (draft PRs stop at the fast gate) is green but not sufficient.
 */
export function isSufficientCiEvidence(jobs: readonly CiJob[]): boolean {
  return REQUIRED_CI_JOBS.every((name) => jobs.some((job) => job.name === name && job.conclusion === 'success'));
}

export type RevisionSource = { kind: 'pr'; number: number } | { kind: 'branch'; name: string };

export function parseRevisionSource(kind: string | undefined, ref: string | undefined): RevisionSource {
  const value = ref?.trim();
  if (kind === 'pr') {
    const number = Number(value?.replace(/^#/, ''));
    if (!Number.isInteger(number) || number <= 0) throw new DeployError(`"${ref ?? ''}" is not a pull request number.`);
    return { kind: 'pr', number };
  }
  if (kind === 'branch') {
    if (!value || !/^[\w./-]+$/.test(value) || value.includes('..')) {
      throw new DeployError(`"${ref ?? ''}" is not a valid branch name.`);
    }
    return { kind: 'branch', name: value };
  }
  throw new DeployError(`Unknown revision source "${kind ?? ''}". Expected "pr" or "branch".`);
}

export function sourceLabel(source: RevisionSource): string {
  return source.kind === 'pr' ? `pr:${source.number}` : `branch:${source.name}`;
}

export interface PullRequestHead {
  state?: string;
  head?: { sha: string; repo: { full_name: string } | null };
}

/**
 * Deploying runs the selected revision's own install/build/deploy tooling with Cloudflare
 * credentials, so only open PRs whose head branch lives in this repository (written only by
 * people with push access) are deployable. Fork PRs are refused.
 */
export function pullRequestHeadProblem(number: number, pr: PullRequestHead, repository: string): string | null {
  if (!pr.head) return `Pull request #${number} cannot be resolved.`;
  if (pr.state !== 'open') return `Pull request #${number} is ${pr.state ?? 'not open'}, not open.`;
  const headRepository = pr.head.repo?.full_name;
  if (headRepository?.toLowerCase() !== repository.toLowerCase()) {
    return `Pull request #${number} comes from ${headRepository ?? 'a deleted repository'}, not ${repository}; only same-repository branches can be deployed.`;
  }
  return null;
}

/** Replace one environment's database_id in wrangler.jsonc text, keeping comments/formatting. */
export function withDatabaseId(configText: string, env: EnvironmentName, databaseId: string): string {
  const pattern = new RegExp(
    `("database_name":\\s*"${ENVIRONMENTS[env].database}",\\s*"database_id":\\s*")[^"]*(")`,
    'g',
  );
  const matches = configText.match(pattern)?.length ?? 0;
  if (matches !== 1) throw new DeployError(`Could not find exactly one D1 entry for ${env} in wrangler.jsonc.`);
  return configText.replace(pattern, `$1${databaseId}$2`);
}
