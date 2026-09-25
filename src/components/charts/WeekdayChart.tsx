import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WeekdayStats } from '../../domain/stats';
import { WEEKDAY_NAMES, WEEKDAY_SHORT, formatClock, formatDuration, pluralize } from '../format';
import { TooltipCard, TooltipRow } from './ChartTooltip';
import { axisProps, barRadius, chartColors, cursorProps } from './theme';
import styles from './charts.module.css';

interface Datum extends WeekdayStats {
  name: string;
  hours: number | null;
  countLabel: string;
}

/** Average time in bed per weekday of the night date, with sample counts on every bar. */
export function WeekdayChart({ weekdays, height = 220 }: { weekdays: WeekdayStats[]; height?: number }) {
  const data: Datum[] = weekdays.map((w) => ({
    ...w,
    name: WEEKDAY_SHORT[w.weekday - 1]!,
    hours: w.meanMinutes === null ? null : w.meanMinutes / 60,
    countLabel: `${w.completeNights}/${w.nights}`,
  }));
  const maxHours = Math.max(10, ...data.map((d) => Math.ceil(d.hours ?? 0)));
  return (
    <div className={styles.chart} role="img" aria-label="Average time in bed by weekday">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} maxBarSize={44} margin={{ top: 20, right: 4, bottom: 0, left: -18 }} barCategoryGap="24%">
          <XAxis dataKey="name" {...axisProps} interval={0} />
          <YAxis
            {...axisProps}
            domain={[0, maxHours]}
            ticks={[0, 2, 4, 6, 8, 10, 12].filter((t) => t <= maxHours)}
            tickFormatter={(v: number) => `${v}h`}
            width={44}
          />
          <Tooltip cursor={cursorProps} content={<WeekdayTooltip />} isAnimationActive={false} />
          <Bar dataKey="hours" fill={chartColors.primary} radius={barRadius} isAnimationActive={false}>
            <LabelList dataKey="countLabel" position="top" fill={chartColors.axis} fontSize={10} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className={styles.legend}>Labels show complete nights / nights in period for each weekday.</p>
    </div>
  );
}

function WeekdayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Datum }> }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <TooltipCard title={`${WEEKDAY_NAMES[d.weekday - 1]} nights`}>
      <TooltipRow label="Average" value={formatDuration(d.meanMinutes)} />
      <TooltipRow label="Median" value={formatDuration(d.medianMinutes)} />
      <TooltipRow label="Typical bedtime" value={formatClock(d.typicalBedtimeMinutes)} swatch={chartColors.bedtime} />
      <TooltipRow label="Typical wake-up" value={formatClock(d.typicalWakeMinutes)} swatch={chartColors.wake} />
      <TooltipRow label="Complete" value={`${pluralize(d.completeNights, 'night')} of ${d.nights}`} />
    </TooltipCard>
  );
}
