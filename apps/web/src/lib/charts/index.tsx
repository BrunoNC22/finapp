/**
 * Ponto de entrada dos gráficos: importe daqui, nunca de "chart.js" ou "react-chartjs-2"
 * (regra de lint). Os componentes aplicam o tema de chart-config.ts e se redesenham quando ele muda.
 */
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useThemeVersion } from '../theme';
import { applyChartTheme, type Palette } from './chart-config';

export {
  categoryAxis,
  categoryColor,
  categoryColors,
  dataset,
  moneyAxis,
  moneyLabel,
  monthLabels,
  type Palette,
  previewHover,
  readPalette,
  type SemanticColor,
  withAlpha,
} from './chart-config';

/** Tema dos gráficos + paleta atual (para cores de datasets). */
export function useChartTheme(): { palette: Palette; version: string } {
  const version = useThemeVersion();
  // biome-ignore lint/correctness/useExhaustiveDependencies: reaplicar quando o tema (version) muda
  const palette = useMemo(() => applyChartTheme(), [version]);
  return { palette, version };
}

export function BarChart(props: ComponentProps<typeof Bar>) {
  const { version } = useChartTheme();
  return <Bar key={version} {...props} />;
}

export function LineChart(props: ComponentProps<typeof Line>) {
  const { version } = useChartTheme();
  return <Line key={version} {...props} />;
}

export function DoughnutChart(props: ComponentProps<typeof Doughnut>) {
  const { version } = useChartTheme();
  return <Doughnut key={version} {...props} />;
}
