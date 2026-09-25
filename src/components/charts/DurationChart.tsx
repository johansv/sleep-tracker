import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NightPoint } from '../../domain/stats';
import { formatAxisOffset, formatDuration, formatShortDate } from '../format';
import { TooltipCard, TooltipRow } from './ChartTooltip';
import { dateTickFormatter, dateTicks } from './ticks';
import { axisProps, barRadius, chartColors, cursorProps } from './theme';
import styles from './charts.module.css';

interface Datum extends NightPoint {
  /** Hours in bed, or a small placeholder so missing/incomplete nights stay visible without reading as 0 h. */
  value: number;
}

const MARKER_HOURS = 0.3;
const STATUS_FILL = {
  complete: chartColors.primary,
  incomplete: chartColors.warning,
  missing: chartColors.missing,
} as const;

/** Per-night time in bed. Missing and incomplete nights show as muted markers, never as 0 h. */
export function DurationChart({
  series,
  meanMinutes,
  height = 220,
}: {
  series: NightPoint[];
  meanMinutes: number | null;
  height?: number;
}) {
  const data: Datum[] = series.map((p) => ({
    ...p,
    value: p.minutes === null ? MARKER_HOURS : p.minutes / 60,
  }));
  const maxHours = Math.max(10, ...data.map((d) => Math.ceil(d.value)));
  const dense = series.length > 45;

  return (
    <div className={styles.chart} role="img" aria-label="Time in bed per night">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          maxBarSize={44}
          margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
          barCategoryGap={dense ? 1 : '22%'}
        >
          <XAxis
            dataKey="date"
            {...axisProps}
            ticks={dateTicks(series)}
            tickFormatter={dateTickFormatter(series)}
            interval={0}
            minTickGap={4}
          />
          <YAxis
            {...axisProps}
            domain={[0, maxHours]}
            ticks={[0, 2, 4, 6, 8, 10, 12].filter((t) => t <= maxHours)}
            tickFormatter={(v: number) => `${v}h`}
            width={44}
          />
          <Tooltip cursor={cursorProps} content={<NightTooltip />} isAnimationActive={false} />
          {meanMinutes !== null && (
            <ReferenceLine
              y={meanMinutes / 60}
              stroke={chartColors.reference}
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          )}
          <Bar dataKey="value" radius={dense ? [2, 2, 0, 0] : barRadius} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.date} fill={STATUS_FILL[d.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className={styles.legend} aria-hidden="true">
        {meanMinutes !== null && (
          <span className={styles.legendItem}>
            <span className={styles.legendLine} /> Average {formatDuration(meanMinutes)}
          </span>
        )}
        <span className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: chartColors.warning }} /> Incomplete
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: chartColors.missing }} /> No record
        </span>
      </div>
    </div>
  );
}

function NightTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Datum }> }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <TooltipCard title={`Night ending ${formatShortDate(d.date)}`}>
      {d.status === 'complete' ? (
        <>
          <TooltipRow label="Time in bed" value={formatDuration(d.minutes)} />
          <TooltipRow label="Bedtime" value={formatAxisOffset(d.bedtimeOffset!)} swatch={chartColors.bedtime} />
          <TooltipRow label="Wake-up" value={formatAxisOffset(d.wakeOffset!)} swatch={chartColors.wake} />
        </>
      ) : d.status === 'incomplete' ? (
        <TooltipRow
          label={d.bedtimeOffset !== null ? 'Bedtime only' : 'Wake-up only'}
          value={formatAxisOffset((d.bedtimeOffset ?? d.wakeOffset)!)}
        />
      ) : (
        <TooltipRow label="No record" value="" />
      )}
    </TooltipCard>
  );
}
