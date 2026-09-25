import type { PeriodStats } from '../domain/stats';

/** Identity colors map to semantic design tokens (`--identity-<color>`). */
export const PROFILE_COLORS = ['lavender', 'teal', 'amber', 'rose', 'sky', 'lime'] as const;
export type ProfileColor = (typeof PROFILE_COLORS)[number];

export interface Profile {
  id: string;
  name: string;
  color: ProfileColor;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SleepSession {
  id: string;
  profileId: string;
  nightDate: string;
  bedtime: string | null;
  wakeTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionListResponse {
  sessions: SleepSession[];
  /** Earliest/latest nights recorded for the profile at all, independent of the requested range. */
  earliestNightDate: string | null;
  latestNightDate: string | null;
}

export interface ProfileStats {
  profileId: string;
  stats: PeriodStats;
}

export interface StatsResponse {
  profiles: ProfileStats[];
}

export interface CreateProfileInput {
  name: string;
  color: ProfileColor;
}

export interface UpdateProfileInput {
  name?: string;
  color?: ProfileColor;
  isActive?: boolean;
}

export interface SessionBody {
  nightDate: string;
  bedtime: string | null;
  wakeTime: string | null;
}

export interface CreateSessionInput extends SessionBody {
  profileId: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: string[] };
}

/**
 * `GET /api/health`: safe deployment signal used by remote smoke/status checks. Exposes which
 * environment and source revision is running and whether the D1 binding answers, never data.
 */
export interface HealthResponse {
  ok: boolean;
  /** `local` for development/tests, otherwise `dev`, `staging` or `production`. */
  environment: string;
  /** Git commit SHA the deployment was built from (null when not deployed by `pnpm cf`). */
  revision: string | null;
  /** Where that revision came from, e.g. `pr:12`, `branch:dev` or `local`. */
  source: string | null;
  /** Cloudflare Worker version, when the runtime provides version metadata. */
  workerVersion: { id: string; tag: string | null; timestamp: string | null } | null;
  database: { ok: boolean; latestMigration: string | null };
}
