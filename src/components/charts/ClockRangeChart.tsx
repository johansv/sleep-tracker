import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NightPoint } from '../../domain/stats';
import { AXIS_END, AXIS_START } from '../NightBar';
import { formatAxisOffset, formatClock, formatDuration, formatShortDate } from '../format';
import { TooltipCard, TooltipRow } from './ChartTooltip';
import { dateTickFormatter, dateTicks } from './ticks';
import { axisProps, chartColors, cursorProps } from './theme';
import styles from './charts.module.css';

interface Datum extends NightPoint {
  range: [number, number] | null;
}

/** Minutes of day → axis offset (minutes since noon the previous day). */
function toAxis(minuteOfDay: number): number {
  return (minuteOfDay + 12 * 60) % (24 * 60);
}

const TICKS = [360, 480, 600, 720, 840, 960, 1080, 1200, 1320, 1440];

/** Bedtime → wake-up interval per night on a continuous evening→morning axis. */
export function ClockRangeChart({
  series,
  typicalBedtime,
  typicalWake,
  height = 240,
}: {
  series: NightPoint[];
  typicalBedtime: number | null;
  typicalWake: number | null;
  height?: number;
}) {
  const data: Datum[] = series.map((p) => ({
    ...p,
    range: p.status === 'complete' ? [p.bedtimeOffset!, p.wakeOffset!] : null,
  }));
  const complete = data.filter((d) => d.range);
  const lo = Math.min(AXIS_END, ...complete.map((d) => d.range![0]));
  const hi = Math.max(AXIS_START, ...complete.map((d) => d.range![1]));
  const domain: [number, number] = complete.length
    ? [Math.max(0, Math.floor((lo - 30) / 120) * 120), Math.min(1440 + 360, Math.ceil((hi + 30) / 120) * 120)]
    : [AXIS_START, AXIS_END];
  const dense = series.length > 45;

  return (
    <div className={styles.chart} role="img" aria-label="Bedtime and wake-up per night">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          maxBarSize={44}
          margin={{ top: 8, right: 4, bottom: 0, left: -12 }}
          barCategoryGap={dense ? 1 : '22%'}
        >
          <defs>
            <linearGradient id="night-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.bedtime} />
              <stop offset="100%" stopColor={chartColors.wake} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            {...axisProps}
            ticks={dateTicks(series)}
            tickFormatter={dateTickFormatter(series)}
            interval={0}
          />
          <YAxis
            {...axisProps}
            reversed
            domain={domain}
            ticks={TICKS.filter((t) => t >= domain[0] && t <= domain[1])}
            tickFormatter={formatAxisOffset}
            width={50}
          />
          <Tooltip cursor={cursorProps} content={<RangeTooltip />} isAnimationActive={false} />
          {typicalBedtime !== null && (
            <ReferenceLine
              y={toAxis(typicalBedtime)}
              stroke={chartColors.bedtime}
              strokeDasharray="4 4"
              strokeOpacity={0.7}
            />
          )}
          {typicalWake !== null && (
            <ReferenceLine
              y={toAxis(typicalWake)}
              stroke={chartColors.wake}
              strokeDasharray="4 4"
              strokeOpacity={0.7}
            />
          )}
          <Bar dataKey="range" fill="url(#night-gradient)" radius={dense ? 2 : 6} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className={styles.legend} aria-hidden="true">
        {typicalBedtime !== null && (
          <span className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: chartColors.bedtime }} /> Typical bedtime{' '}
            {formatClock(typicalBedtime)}
          </span>
        )}
        {typicalWake !== null && (
          <span className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: chartColors.wake }} /> Typical wake-up{' '}
            {formatClock(typicalWake)}
          </span>
        )}
      </div>
    </div>
  );
}

function RangeTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Datum }> }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <TooltipCard title={`Night ending ${formatShortDate(d.date)}`}>
      {d.range ? (
        <>
          <TooltipRow label="Bedtime" value={formatAxisOffset(d.range[0])} swatch={chartColors.bedtime} />
          <TooltipRow label="Wake-up" value={formatAxisOffset(d.range[1])} swatch={chartColors.wake} />
          <TooltipRow label="Time in bed" value={formatDuration(d.minutes)} />
        </>
      ) : (
        <TooltipRow label={d.status === 'incomplete' ? 'Incomplete' : 'No record'} value="" />
      )}
    </TooltipCard>
  );
}
