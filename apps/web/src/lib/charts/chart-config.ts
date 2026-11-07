/**
 * CONFIGURAÇÃO ÚNICA DOS GRÁFICOS (ADR 0007).
 * Tudo o que define a aparência dos gráficos mora aqui: componentes registrados, cores (lidas dos
 * tokens CSS em styles/tokens.css), fonte, legenda, tooltip e formatação de dinheiro.
 * As telas importam os gráficos de "@/lib/charts" e não definem cor nem formato próprios.
 */
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  type ScaleOptions,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { formatCents, formatCentsCompact, formatMonth } from '../format';

// Só o que o app usa (tree-shaking).
Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
);

export interface Palette {
  readonly text: string;
  readonly muted: string;
  readonly grid: string;
  readonly surface: string;
  readonly border: string;
  readonly income: string;
  readonly expense: string;
  readonly transfer: string;
  readonly committed: string;
  readonly goal: string;
  /** Cores para categorias (até 8; depois repetem). */
  readonly categorical: readonly string[];
}

/** Lê as cores dos tokens CSS do tema ativo. */
export function readPalette(root: HTMLElement = document.documentElement): Palette {
  const css = getComputedStyle(root);
  const token = (name: string) => css.getPropertyValue(`--${name}`).trim();
  return {
    text: token('text'),
    muted: token('text-muted'),
    grid: token('chart-grid'),
    surface: token('surface'),
    border: token('border'),
    income: token('income'),
    expense: token('expense'),
    transfer: token('transfer'),
    committed: token('committed'),
    goal: token('goal'),
    categorical: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => token(`chart-${i}`)),
  };
}

/** Tooltip padrão: os valores dos gráficos estão em CENTAVOS e aparecem em reais. */
export function moneyLabel(item: TooltipItem<'bar' | 'line' | 'doughnut'>): string {
  const label = item.dataset.label || item.label;
  const value = typeof item.raw === 'number' ? item.raw : Number(item.parsed);
  return `${label}: ${formatCents(value)}`;
}

/** Aplica o tema atual aos padrões do Chart.js. Chamado na montagem e quando o tema muda. */
export function applyChartTheme(root: HTMLElement = document.documentElement): Palette {
  const palette = readPalette(root);
  const defaults = Chart.defaults;
  defaults.font.family = getComputedStyle(root).getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif';
  defaults.font.size = 12;
  defaults.color = palette.muted;
  defaults.borderColor = palette.grid;
  defaults.maintainAspectRatio = false;
  defaults.animation = { duration: 250 };

  defaults.plugins.legend.position = 'bottom';
  defaults.plugins.legend.labels.usePointStyle = true;
  defaults.plugins.legend.labels.boxWidth = 8;
  defaults.plugins.legend.labels.padding = 16;
  defaults.plugins.legend.labels.color = palette.text;

  const tooltip = defaults.plugins.tooltip;
  tooltip.backgroundColor = palette.surface;
  tooltip.titleColor = palette.text;
  tooltip.bodyColor = palette.text;
  tooltip.borderColor = palette.border;
  tooltip.borderWidth = 1;
  tooltip.padding = 10;
  tooltip.cornerRadius = 8;
  tooltip.boxPadding = 4;
  tooltip.usePointStyle = true;
  tooltip.callbacks.label = moneyLabel as never;

  defaults.elements.bar.borderRadius = 4;
  defaults.elements.line.borderWidth = 2;
  defaults.elements.line.tension = 0.3;
  defaults.elements.point.radius = 2;
  defaults.elements.arc.borderWidth = 2;
  defaults.elements.arc.borderColor = palette.surface;
  return palette;
}

/** Eixo de valores em centavos, com ticks em reais compactos ("R$ 1,2 mil"). */
export const moneyAxis: ScaleOptions<'linear'> = {
  beginAtZero: true,
  ticks: { callback: (value) => formatCentsCompact(Number(value)) },
} as ScaleOptions<'linear'>;

/** "2026-10" → "out/26" para eixos de meses. */
export const monthLabels = (months: readonly string[]): string[] => months.map(formatMonth);

/** Cor estável por categoria: a mesma categoria tem sempre a mesma cor. Sem categoria = cinza. */
export function categoryColor(categoryId: string | null, palette: Palette): string {
  if (!categoryId) return palette.transfer;
  const group = categoryId.split('.')[0] ?? categoryId;
  let hash = 0;
  for (const char of group) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette.categorical[hash % palette.categorical.length] ?? palette.transfer;
}
