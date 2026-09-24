import {
  addDays,
  civilMinutesBetween,
  datePart,
  isLocalDate,
  isLocalDateTime,
  type LocalDate,
  type LocalDateTime,
} from './civil';

/** The persisted essence of one profile's night. */
export interface SessionEndpoints {
  /** Local date on which the night ends (the wake-up date for complete sessions). */
  nightDate: LocalDate;
  bedtime: LocalDateTime | null;
  wakeTime: LocalDateTime | null;
}

export type SessionStatus = 'complete' | 'incomplete';

export type SessionIssueCode =
  | 'invalid_night_date'
  | 'invalid_bedtime'
  | 'invalid_wake_time'
  | 'no_endpoints'
  | 'wake_date_mismatch'
  | 'wake_not_after_bedtime';

export interface SessionIssue {
  code: SessionIssueCode;
  message: string;
}

/**
 * Hard validation: structurally impossible state that must never be persisted.
 * Unusual (but possible) durations are warnings, see `sessionWarnings`.
 */
export function validateSession(s: SessionEndpoints): SessionIssue[] {
  const issues: SessionIssue[] = [];
  if (!isLocalDate(s.nightDate)) {
    issues.push({ code: 'invalid_night_date', message: 'Night date must be a valid YYYY-MM-DD date.' });
  }
  if (s.bedtime !== null && !isLocalDateTime(s.bedtime)) {
    issues.push({ code: 'invalid_bedtime', message: 'Bedtime must be a valid local date and time.' });
  }
  if (s.wakeTime !== null && !isLocalDateTime(s.wakeTime)) {
    issues.push({ code: 'invalid_wake_time', message: 'Wake-up must be a valid local date and time.' });
  }
  if (s.bedtime === null && s.wakeTime === null) {
    issues.push({ code: 'no_endpoints', message: 'Record a bedtime, a wake-up time, or both.' });
  }
  if (issues.length > 0) return issues;

  if (s.wakeTime !== null && datePart(s.wakeTime) !== s.nightDate) {
    issues.push({
      code: 'wake_date_mismatch',
      message: 'Wake-up must be on the date the night ends.',
    });
  }
  if (s.bedtime !== null && s.wakeTime !== null && civilMinutesBetween(s.bedtime, s.wakeTime) <= 0) {
    issues.push({ code: 'wake_not_after_bedtime', message: 'Wake-up must be after bedtime.' });
  }
  return issues;
}

export function sessionStatus(s: SessionEndpoints): SessionStatus {
  return s.bedtime !== null && s.wakeTime !== null && validateSession(s).length === 0 ? 'complete' : 'incomplete';
}

/** Wall-clock time in bed in minutes, or null unless the session is complete and valid. */
export function timeInBedMinutes(s: SessionEndpoints): number | null {
  if (sessionStatus(s) !== 'complete') return null;
  return civilMinutesBetween(s.bedtime!, s.wakeTime!);
}

export const SHORT_NIGHT_MINUTES = 3 * 60;
export const LONG_NIGHT_MINUTES = 14 * 60;

export type SessionWarningCode = 'short_night' | 'long_night' | 'early_bedtime';

/** Soft warnings: plausible but unusual values the user may want to double-check. */
export function sessionWarnings(s: SessionEndpoints): SessionWarningCode[] {
  const warnings: SessionWarningCode[] = [];
  const minutes = timeInBedMinutes(s);
  if (minutes !== null && minutes < SHORT_NIGHT_MINUTES) warnings.push('short_night');
  if (minutes !== null && minutes > LONG_NIGHT_MINUTES) warnings.push('long_night');
  if (s.bedtime !== null && s.wakeTime === null && isLocalDateTime(s.bedtime)) {
    const bedDate = datePart(s.bedtime);
    if (bedDate !== s.nightDate && bedDate !== addDays(s.nightDate, -1)) warnings.push('early_bedtime');
  }
  return warnings;
}

/**
 * Night a new bedtime most likely belongs to: bedtimes from mid-afternoon onwards start the
 * night ending tomorrow; after-midnight bedtimes belong to the night ending today.
 */
export const EVENING_STARTS_AT_HOUR = 15;

export function nightForBedtime(bedtime: LocalDateTime): LocalDate {
  const date = datePart(bedtime);
  const hour = Number(bedtime.slice(11, 13));
  return hour >= EVENING_STARTS_AT_HOUR ? addDays(date, 1) : date;
}

/** Night a wake-up belongs to is always the wake-up date. */
export function nightForWake(wakeTime: LocalDateTime): LocalDate {
  return datePart(wakeTime);
}
