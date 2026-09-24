import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { formatDuration } from '../format';
import { axisProps } from './theme';
import styles from './charts.module.css';

export interface ComparisonDatum {
  name: string;
  color: string;
  meanMinutes: number | null;
}

/** Average time in bed per profile over the same period, colored by profile identity. */
export function ComparisonChart({ data }: { data: ComparisonDatum[] }) {
  const rows = data.map((d) => ({
    ...d,
    hours: d.meanMinutes === null ? 0 : d.meanMinutes / 60,
    label: d.meanMinutes === null ? 'No complete nights' : formatDuration(d.meanMinutes),
  }));
  const maxHours = Math.max(10, ...rows.map((r) => Math.ceil(r.hours)));
  return (
    <div className={styles.chart} role="img" aria-label="Average time in bed by person">
      <ResponsiveContainer width="100%" height={rows.length * 48 + 16}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 110, bottom: 0, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, maxHours]} />
          <YAxis
            type="category"
            dataKey="name"
            {...axisProps}
            tick={{ ...axisProps.tick, fill: 'var(--color-text-secondary)', fontSize: 13 }}
            width={72}
          />
          <Bar dataKey="hours" radius={[6, 6, 6, 6]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.color} />
            ))}
            <LabelList dataKey="label" position="right" fill="var(--color-text)" fontSize={12} fontWeight={600} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
