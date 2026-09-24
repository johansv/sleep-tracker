import { todayLocal } from '../src/domain/civil';
import { destroyD1, DEVELOPER_STATE_DIR, migrate, seed } from './local-d1';

/**
 * Developer-local database commands (`pnpm db:seed`, `pnpm db:reset`).
 * They only ever touch the local developer store in `.wrangler/state`.
 * Set SEED_ANCHOR=YYYY-MM-DD to seed relative to a fixed date instead of today.
 */

const command = process.argv[2];
const anchor = process.env.SEED_ANCHOR ?? todayLocal();

switch (command) {
  case 'seed':
    seed(anchor);
    console.log(`Seeded demo data anchored at ${anchor}.`);
    break;
  case 'reset':
    destroyD1(DEVELOPER_STATE_DIR);
    migrate();
    seed(anchor);
    console.log(`Reset the local developer database and seeded demo data anchored at ${anchor}.`);
    break;
  default:
    console.error('Usage: tsx scripts/db.ts <seed|reset>');
    process.exit(1);
}
