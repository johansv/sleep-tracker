import type { Authentication } from './auth';

/**
 * Resolves which household an authenticated request may access.
 *
 * Auth (src/worker/auth.ts) proves the caller knows this environment's password; there are no
 * user accounts, so every authenticated request acts on the single default household. Future
 * account auth maps identities to households here, without touching routes, persistence or
 * domain logic.
 */
export interface RequestContext {
  householdId: string;
}

export const DEFAULT_HOUSEHOLD_ID = 'hh_default';

export function resolveRequestContext(_auth: Authentication): RequestContext {
  return { householdId: DEFAULT_HOUSEHOLD_ID };
}
