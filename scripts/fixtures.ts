import { addDays, Temporal, weekday } from '../src/domain/time.ts';
import type { Session } from '../src/shared/models.ts';

export const demoAnchor = '2026-09-24';
export const demoProfiles = [
  { id: 'demo-alex', name: 'Alex', is_active: 1 },
  { id: 'demo-jamie', name: 'Jamie', is_active: 1 },
  { id: 'demo-robin', name: 'Robin', is_active: 1 },
];
export function demoSessions(): Session[] {
  const rows: Session[] = [];
  for (let i = 0; i < 267; i++) {
    const date = addDays('2026-01-01', i);
    for (const [p, person] of demoProfiles.entries()) {
      if ((p === 1 && i % 5 === 0) || (p === 2 && (i < 257 || i % 3 !== 0))) continue;
      const weekend = weekday(date) >= 6;
      const jitter = p === 0 ? ((i % 5) - 2) * (i >= 210 && i < 230 ? 24 : 5) : ((i % 7) - 3) * 23;
      const wake = Temporal.PlainDateTime.from(`${date}T07:00`).add({
        minutes: (weekend ? 65 : 0) + p * 40 + jitter,
      });
      const bed = wake.subtract({
        minutes: p === 0 ? 480 + ((i % 3) - 1) * 10 : 420 + ((i % 6) - 2) * 22,
      });
      rows.push({
        id: `${person.id}-${date}`,
        profile_id: person.id,
        night_date: date,
        bedtime_local:
          date === '2026-09-23' && p === 1 ? null : bed.toString({ smallestUnit: 'minute' }),
        wake_time_local:
          date === '2026-09-24' && p === 0 ? null : wake.toString({ smallestUnit: 'minute' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
    }
  }
  return rows;
}
const sqlText = (value: string | null) =>
  value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
export function seedSQL(): string {
  // Repeatable, additive seed: never overwrite manually edited records.
  return [
    ...demoProfiles.map(
      (p) =>
        `INSERT OR IGNORE INTO profiles (id, household_id, name, is_active, created_at, updated_at) VALUES (${sqlText(p.id)}, 'local-household', ${sqlText(p.name)}, ${p.is_active}, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');`,
    ),
    ...demoSessions().map(
      (s) =>
        `INSERT OR IGNORE INTO sessions (id, profile_id, night_date, bedtime_local, wake_time_local, created_at, updated_at) VALUES (${[s.id, s.profile_id, s.night_date, s.bedtime_local, s.wake_time_local, s.created_at, s.updated_at].map(sqlText).join(', ')});`,
    ),
  ].join('\n');
}
