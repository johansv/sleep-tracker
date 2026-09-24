import { lazy, Suspense } from 'react';
import { ArrowUpRight, Moon, Sun } from 'lucide-react';
import type { Comparison } from '../api/client';
import type { Statistics } from '../domain/statistics';
import { formatClock, formatDate, formatDuration } from '../domain/time';

const TrendChart = lazy(() => import('../components/TrendChart'));
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function ClockCard({
  title,
  icon,
  typical,
  deviation,
  stats,
}: {
  title: string;
  icon: React.ReactNode;
  typical: number | null;
  deviation: number | null;
  stats: Statistics;
}) {
  return (
    <section className="card clock-card">
      <div className="section-heading">
        <h3>{title}</h3>
        {icon}
      </div>
      <p className="clock-value">{formatClock(typical)}</p>
      <p className="muted">Typical time · circular mean</p>
      <div className="divider" />
      <div className="section-heading">
        <span>Variability</span>
        <strong>{deviation === null ? '—' : `${Math.round(deviation)} min`}</strong>
      </div>
      <p className="helper">Median distance from your typical time. Lower means more consistent.</p>
      <p className="sample">
        {stats.count} complete nights of {stats.total}
      </p>
    </section>
  );
}
export function Insights({
  stats,
  comparison,
  profileId,
}: {
  stats: Statistics;
  comparison: Comparison;
  profileId: string;
}) {
  return (
    <div className="insights-grid">
      <section className="card summary-card">
        <p className="eyebrow">YOUR TIME IN BED</p>
        <div className="summary-values">
          <div>
            <p className="hero-number">{formatDuration(stats.mean)}</p>
            <p>Nightly average</p>
          </div>
          <div>
            <p className="medium-number">{formatDuration(stats.median)}</p>
            <p>Median</p>
          </div>
        </div>
        <div className="coverage-line">
          <span>
            <strong>{stats.count}</strong> complete nights of {stats.total}
          </span>
          <span>{Math.round((stats.count / stats.total) * 100)}% coverage</span>
        </div>
        <progress max={stats.total} value={stats.count} aria-label="Complete-night coverage" />
        <p className="helper">
          {stats.incomplete} incomplete · {stats.missing} missing. Only complete nights enter your
          insights.
        </p>
      </section>
      <section className="card trend-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE BIGGER PICTURE</p>
            <h2>Your nightly rhythm</h2>
          </div>
          <ArrowUpRight className="muted" />
        </div>
        <p className="helper">
          Time in bed · {stats.count} complete nights of {stats.total}
        </p>
        {stats.count ? (
          <Suspense fallback={<div className="chart-loading">Drawing your nights…</div>}>
            <TrendChart stats={stats} />
          </Suspense>
        ) : (
          <div className="chart-empty">
            <Moon />
            <h3>A little history goes a long way</h3>
            <p>Complete a night to see your rhythm here.</p>
          </div>
        )}
        <details className="data-details">
          <summary>View nightly values</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Night ending</th>
                  <th>Time in bed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.trend.map((t) => (
                  <tr key={t.date}>
                    <td>{formatDate(t.date)}</td>
                    <td>{formatDuration(t.minutes)}</td>
                    <td>{t.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <ClockCard
        title="Bedtime rhythm"
        icon={<Moon />}
        typical={stats.bedtime}
        deviation={stats.bedtimeVariability}
        stats={stats}
      />
      <ClockCard
        title="Morning rhythm"
        icon={<Sun />}
        typical={stats.wake}
        deviation={stats.wakeVariability}
        stats={stats}
      />
      <section className="card weekdays-card">
        <p className="eyebrow">DAY BY DAY</p>
        <h2>A week, on average</h2>
        <p className="helper">Grouped by the day your night ends.</p>
        <div className="weekday-list">
          {stats.weekdays.map((w) => (
            <div className="weekday-row" key={w.day}>
              <strong>{days[w.day - 1]}</strong>
              <div className="weekday-track">
                <span
                  style={{
                    width: `${w.mean === null ? 0 : Math.min((w.mean / Math.max(...stats.weekdays.map((d) => d.mean ?? 0), 1)) * 100, 100)}%`,
                  }}
                />
              </div>
              <span>{formatDuration(w.mean)}</span>
              <small>
                {w.count}/{w.total} nights
              </small>
            </div>
          ))}
        </div>
      </section>
      <section className="card comparison-card">
        <p className="eyebrow">SIDE BY SIDE</p>
        <h2>Everyone’s rhythm</h2>
        <p className="helper">Same period. Different people. Compare with coverage in mind.</p>
        <div className="comparison-list">
          {comparison.map(({ profile, statistics: s }) => (
            <article
              key={profile.id}
              className={`comparison-row ${profile.id === profileId ? 'selected' : ''}`}
            >
              <div className="avatar small">{profile.name.slice(0, 1)}</div>
              <div className="person-summary">
                <strong>
                  {profile.name}
                  {!profile.is_active && <small> · inactive</small>}
                </strong>
                <span>
                  {s.count} complete nights of {s.total}
                </span>
              </div>
              <div className="compare-values">
                <strong>{formatDuration(s.mean)}</strong>
                <span>average</span>
                <small>Median {formatDuration(s.median)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
