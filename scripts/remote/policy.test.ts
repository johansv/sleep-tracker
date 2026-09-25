import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unstable_readConfig } from 'wrangler';
import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '../../src/shared/api';
import {
  assertOperationAllowed,
  CI_WORKFLOW_PATH,
  DeployError,
  ENVIRONMENT_NAMES,
  ENVIRONMENTS,
  isOperationAllowed,
  isReusableCiRun,
  isSufficientCiEvidence,
  latestMigration,
  OPERATIONS,
  parseEnvironment,
  parseOperation,
  parseRevisionSource,
  PLACEHOLDER_DATABASE_ID,
  REQUIRED_CI_JOBS,
  smokeProblems,
  sourceLabel,
  withDatabaseId,
} from './policy';

describe('environment and operation policy', () => {
  it('accepts exactly the three permanent environments', () => {
    expect(ENVIRONMENT_NAMES).toEqual(['dev', 'staging', 'production']);
    for (const env of ENVIRONMENT_NAMES) expect(parseEnvironment(env)).toBe(env);
    for (const bad of [undefined, '', 'prod', 'local', 'toString', 'Dev']) {
      expect(() => parseEnvironment(bad)).toThrow(DeployError);
    }
    expect(() => parseOperation('deploy')).toThrow(/Expected one of/);
  });

  it('never allows seed or reset on production, and allows everything on dev/staging', () => {
    for (const operation of OPERATIONS) {
      expect(isOperationAllowed(operation, 'dev')).toBe(true);
      expect(isOperationAllowed(operation, 'staging')).toBe(true);
      expect(isOperationAllowed(operation, 'production')).toBe(!['seed', 'reset'].includes(operation));
    }
    expect(() => assertOperationAllowed('seed', 'production')).toThrow(/not allowed for production/);
    expect(() => assertOperationAllowed('reset', 'production')).toThrow(DeployError);
  });
});

describe('wrangler.jsonc', () => {
  it('gives each environment its own Worker, hostname, APP_ENV and D1 binding', () => {
    const seen = new Set<string>();
    for (const env of ENVIRONMENT_NAMES) {
      const config = unstable_readConfig({ config: 'wrangler.jsonc', env });
      const expected = ENVIRONMENTS[env];
      expect(config.name).toBe(expected.worker);
      expect(config.vars).toEqual({ APP_ENV: env });
      expect(config.routes).toEqual([{ pattern: expected.hostname, custom_domain: true }]);
      expect(config.workers_dev).toBe(false);
      expect(config.version_metadata).toEqual({ binding: 'CF_VERSION_METADATA' });
      expect(config.d1_databases).toHaveLength(1);
      const [db] = config.d1_databases;
      expect(db).toMatchObject({ binding: 'DB', database_name: expected.database, migrations_dir: 'migrations' });
      const id = db!.database_id!;
      if (id !== PLACEHOLDER_DATABASE_ID) {
        expect(seen.has(id), `${env} shares a D1 database`).toBe(false);
        seen.add(id);
      }
    }
  });

  it('keeps local development on its own placeholder database', () => {
    const config = unstable_readConfig({ config: 'wrangler.jsonc' });
    expect(config.vars).toEqual({ APP_ENV: 'local' });
    expect(config.d1_databases[0]).toMatchObject({ binding: 'DB', database_id: PLACEHOLDER_DATABASE_ID });
  });

  it('can record a provisioned database id for exactly one environment', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const dir = mkdtempSync(path.join(tmpdir(), 'wrangler-config-'));
    try {
      const file = path.join(dir, 'wrangler.jsonc');
      writeFileSync(file, withDatabaseId(readFileSync('wrangler.jsonc', 'utf8'), 'staging', id));
      const idOf = (env?: string) => unstable_readConfig({ config: file, env }).d1_databases[0]?.database_id;
      expect(idOf('staging')).toBe(id);
      for (const env of ['dev', 'production', undefined]) {
        expect(idOf(env)).toBe(unstable_readConfig({ config: 'wrangler.jsonc', env }).d1_databases[0]?.database_id);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(() => withDatabaseId('{}', 'dev', id)).toThrow(DeployError);
  });
});

describe('smoke expectations', () => {
  const healthy: HealthResponse = {
    ok: true,
    environment: 'staging',
    revision: 'abc',
    source: 'pr:1',
    workerVersion: { id: 'v1', tag: 'abc', timestamp: null },
    database: { ok: true, latestMigration: '0002_b.sql' },
  };
  const expected = { environment: 'staging', revision: 'abc', latestMigration: '0002_b.sql' } as const;

  it('passes only for the expected environment, revision and migrated, reachable D1', () => {
    expect(smokeProblems(healthy, expected)).toEqual([]);
    expect(smokeProblems({ ...healthy, environment: 'production' }, expected)).toEqual([
      'environment is "production", expected "staging"',
    ]);
    expect(smokeProblems({ ...healthy, revision: 'old' }, expected)).toEqual(['revision is old, expected abc']);
    expect(smokeProblems({ ...healthy, ok: false, database: { ok: false, latestMigration: null } }, expected)).toEqual([
      'the Worker cannot reach its D1 database',
    ]);
    expect(smokeProblems({ ...healthy, database: { ok: true, latestMigration: '0001_a.sql' } }, expected)).toHaveLength(
      1,
    );
  });

  it('does not require migrations after deploy-only', () => {
    const stale = { ...healthy, database: { ok: true, latestMigration: '0001_a.sql' } };
    expect(smokeProblems(stale, { ...expected, latestMigration: null })).toEqual([]);
  });

  it('knows the newest committed migration', () => {
    expect(latestMigration(['0002_b.sql', '0010_c.sql', '0001_a.sql', 'README.md'])).toBe('0010_c.sql');
    expect(latestMigration([])).toBeNull();
    expect(latestMigration(readdirSync('migrations'))).toMatch(/^\d{4}_.+\.sql$/);
  });
});

describe('release validation evidence', () => {
  it('only reuses push CI that actually tested the exact SHA', () => {
    const sha = 'a'.repeat(40);
    expect(isReusableCiRun({ event: 'push', head_sha: sha }, sha)).toBe(true);
    expect(isReusableCiRun({ event: 'pull_request', head_sha: sha }, sha)).toBe(false);
    expect(isReusableCiRun({ event: 'push', head_sha: 'b'.repeat(40) }, sha)).toBe(false);
  });

  it('requires every required CI job to have succeeded', () => {
    const ok = REQUIRED_CI_JOBS.map((name) => ({ name, conclusion: 'success' }));
    expect(isSufficientCiEvidence(ok)).toBe(true);
    expect(isSufficientCiEvidence([{ name: 'Fast gate', conclusion: 'success' }])).toBe(false);
    expect(
      isSufficientCiEvidence([
        { name: 'Fast gate', conclusion: 'success' },
        { name: 'Integration & browser E2E', conclusion: 'skipped' },
      ]),
    ).toBe(false);
  });

  it('names jobs that exist in the CI workflow', () => {
    const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
    for (const name of REQUIRED_CI_JOBS) expect(workflow).toContain(`name: ${name}\n`);
  });
});

describe('revision sources', () => {
  it('parses PR numbers and branch names', () => {
    expect(parseRevisionSource('pr', '12')).toEqual({ kind: 'pr', number: 12 });
    expect(parseRevisionSource('pr', '#7')).toEqual({ kind: 'pr', number: 7 });
    expect(parseRevisionSource('branch', ' feature/x-1 ')).toEqual({ kind: 'branch', name: 'feature/x-1' });
    expect(sourceLabel({ kind: 'pr', number: 12 })).toBe('pr:12');
    expect(sourceLabel({ kind: 'branch', name: 'dev' })).toBe('branch:dev');
  });

  it('rejects unresolvable input early', () => {
    for (const [kind, ref] of [
      ['pr', 'abc'],
      ['pr', '0'],
      ['pr', '1.5'],
      ['branch', ''],
      ['branch', 'a..b'],
      ['branch', 'x;rm -rf'],
      ['tag', 'v1'],
    ] as const) {
      expect(() => parseRevisionSource(kind, ref)).toThrow(DeployError);
    }
  });
});
