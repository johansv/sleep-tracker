import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Statistics } from '../domain/statistics';
import { formatDate, formatDuration } from '../domain/time';

export default function TrendChart({ stats }: { stats: Statistics }) {
  return (
    <div
      className="trend-chart"
      role="img"
      aria-label={`Time in bed per night: ${stats.count} complete nights of ${stats.total}. Missing and incomplete nights have no bar. Exact values are available in the data table below.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stats.trend} margin={{ top: 12, right: 4, bottom: 4, left: -24 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatDate(d)}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(n) => `${Math.round(n / 60)}h`}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-tint)' }}
            labelFormatter={(d) => formatDate(String(d), true)}
            formatter={(v) => [formatDuration(Number(v)), 'Time in bed']}
            contentStyle={{
              border: '1px solid var(--border)',
              borderRadius: '16px',
              fontSize: '13px',
            }}
          />
          <Bar
            dataKey="minutes"
            fill="var(--accent)"
            radius={[5, 5, 2, 2]}
            maxBarSize={42}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
