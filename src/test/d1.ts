import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Miniflare } from 'miniflare';

/**
 * Fresh, test-owned, in-memory D1 with all committed migrations applied, for Worker integration
 * tests. Nothing touches the developer's persisted local store or any remote database.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
let mf: Miniflare | undefined;

/** SQL text → individual statements (comment lines dropped), as D1 batch input. */
export function sqlStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function freshDatabase(): Promise<D1Database> {
  await mf?.dispose();
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response(null, { status: 404 }); } }',
    d1Databases: { DB: `test-${crypto.randomUUID()}` },
  });
  const database = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const statements = sqlStatements(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    await database.batch(statements.map((s) => database.prepare(s)));
  }
  return database;
}

export async function disposeDatabases(): Promise<void> {
  await mf?.dispose();
  mf = undefined;
}
