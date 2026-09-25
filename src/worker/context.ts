/**
 * Resolves who is acting and which household they may access.
 *
 * V1 has no application authentication: every request acts on the single default household.
 * Future account auth plugs in here, before any resource access, without touching routes,
 * persistence or domain logic.
 */
export interface RequestContext {
  householdId: string;
}

export const DEFAULT_HOUSEHOLD_ID = 'hh_default';

export function resolveRequestContext(_request: Request): RequestContext {
  return { householdId: DEFAULT_HOUSEHOLD_ID };
}
