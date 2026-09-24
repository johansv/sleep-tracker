import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, periodFor, Temporal, today } from '../domain/time';
import type { PeriodKind } from '../shared/models';

export function PeriodControl({
  kind,
  anchor,
  onKind,
  onAnchor,
}: {
  kind: PeriodKind;
  anchor: string;
  onKind: (k: PeriodKind) => void;
  onAnchor: (a: string) => void;
}) {
  const period = periodFor(kind, anchor);
  function shift(direction: number) {
    const date = Temporal.PlainDate.from(anchor);
    onAnchor(
      date
        .add(
          kind === 'year'
            ? { years: direction }
            : kind === 'month'
              ? { months: direction }
              : { days: direction * 7 },
        )
        .toString(),
    );
  }
  return (
    <div className="period-control">
      <div className="segmented" aria-label="Period">
        {(
          [
            ['rolling', 'Last 7 days'],
            ['week', 'Week'],
            ['month', 'Month'],
            ['year', 'Year'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} aria-pressed={kind === id} onClick={() => onKind(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="period-date">
        <button className="icon-button" aria-label="Previous period" onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </button>
        <label>
          <span>
            {formatDate(period.start)} – {formatDate(period.end)}
            {` · ${anchor.slice(0, 4)}`}
          </span>
          <input
            aria-label="Period anchor date"
            type="date"
            value={anchor}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onAnchor(e.target.value);
            }}
          />
        </label>
        <button className="icon-button" aria-label="Next period" onClick={() => shift(1)}>
          <ChevronRight size={18} />
        </button>
        <button className="text-button" onClick={() => onAnchor(today())}>
          Today
        </button>
      </div>
    </div>
  );
}
