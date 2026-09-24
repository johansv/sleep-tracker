export interface Profile {
  id: string;
  household_id: string;
  name: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}
export interface Session {
  id: string;
  profile_id: string;
  night_date: string;
  bedtime_local: string | null;
  wake_time_local: string | null;
  created_at: string;
  updated_at: string;
}
export type SessionInput = Pick<Session, 'night_date' | 'bedtime_local' | 'wake_time_local'>;
export type PeriodKind = 'rolling' | 'week' | 'month' | 'year';
export interface Period {
  start: string;
  end: string;
}
