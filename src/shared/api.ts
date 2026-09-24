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
