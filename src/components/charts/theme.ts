/**
 * Central chart styling so every chart shares the product palette, type and interaction language.
 * Colors reference design tokens (CSS custom properties) rather than raw values.
 */
export const chartColors = {
  primary: 'var(--chart-primary)',
  primaryMuted: 'var(--chart-primary-muted)',
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  reference: 'var(--chart-reference)',
  bedtime: 'var(--color-bedtime)',
  wake: 'var(--color-wake)',
  missing: 'var(--color-missing)',
  warning: 'var(--color-warning)',
} as const;

export const axisTick = { fill: chartColors.axis, fontSize: 11 } as const;

export const axisProps = {
  tick: axisTick,
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: chartColors.grid,
  vertical: false,
} as const;

export const cursorProps = { fill: 'rgb(255 255 255 / 0.04)' } as const;

export const barRadius: [number, number, number, number] = [6, 6, 6, 6];
