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

/**
 * Sem <canvas> utilizável (navegador muito antigo, ambiente de teste), o gráfico não é desenhado em vez
 * de derrubar a tela: o texto acessível fica no contêiner (role="img" + aria-label) de cada gráfico.
 */
let canvasSupport: boolean | undefined;
function canDrawCharts(): boolean {
  canvasSupport ??= typeof document !== 'undefined' && !!document.createElement('canvas').getContext('2d');
  return canvasSupport;
}

export function BarChart(props: ComponentProps<typeof Bar>) {
  const { version } = useChartTheme();
  return canDrawCharts() ? <Bar key={version} {...props} /> : null;
}

export function LineChart(props: ComponentProps<typeof Line>) {
  const { version } = useChartTheme();
  return canDrawCharts() ? <Line key={version} {...props} /> : null;
}

export function DoughnutChart(props: ComponentProps<typeof Doughnut>) {
  const { version } = useChartTheme();
  return canDrawCharts() ? <Doughnut key={version} {...props} /> : null;
}
