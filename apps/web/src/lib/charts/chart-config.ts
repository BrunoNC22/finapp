/**
 * CONFIGURAÇÃO ÚNICA DOS GRÁFICOS (ADR 0007).
 *
 * Tudo o que define a aparência dos gráficos mora aqui:
 *  - componentes registrados e padrões globais do Chart.js;
 *  - cores (lidas dos tokens CSS em styles/tokens.css) e transparências;
 *  - gradientes, animações de entrada e de hover;
 *  - plugins visuais: brilho nas linhas, linha-guia no hover, total no centro da rosca;
 *  - tooltip HTML com efeito de vidro;
 *  - fábricas de datasets (`dataset.bar`, `dataset.ranking`, `dataset.area`, `dataset.line`, `dataset.doughnut`).
 *
 * As telas importam de "@/lib/charts" e NÃO definem cor, animação nem formato próprios.
 */
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartDataset,
  type ChartType,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  type Plugin,
  PointElement,
  type ScaleOptions,
  type ScriptableContext,
  Tooltip,
  type TooltipItem,
  type TooltipModel,
} from 'chart.js';
import { formatCents, formatCentsCompact, formatMonth } from '../format';

// ============================================================================ paleta

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

export type SemanticColor = 'income' | 'expense' | 'transfer' | 'committed' | 'goal';

/** Lê as cores dos tokens CSS do tema ativo (fonte única de cores). */
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

/** Cor com transparência. Aceita #rgb, #rrggbb e rgb()/rgba(). */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex) || /^[0-9a-f]{6}$/i.test(hex)) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /rgba?\(([^)]+)\)/.exec(color);
  if (rgb?.[1]) {
    const [r, g, b] = rgb[1].split(',').map((v) => v.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/** Cor estável por categoria (pelo grupo: subcategorias compartilham a cor). Sem categoria = cinza. */
export function categoryColor(categoryId: string | null, palette: Palette): string {
  if (!categoryId) return palette.transfer;
  const group = categoryId.split('.')[0] ?? categoryId;
  let hash = 0;
  for (const char of group) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette.categorical[hash % palette.categorical.length] ?? palette.transfer;
}

/**
 * Cores para várias categorias no MESMO gráfico: parte da cor estável de cada uma e, se já estiver
 * em uso, pega a próxima livre, para que duas fatias vizinhas nunca tenham a mesma cor.
 */
export function categoryColors(categoryIds: readonly (string | null)[], palette: Palette): string[] {
  const used = new Set<string>();
  return categoryIds.map((id) => {
    if (!id) return palette.transfer;
    const preferred = categoryColor(id, palette);
    const start = Math.max(0, palette.categorical.indexOf(preferred));
    for (let i = 0; i < palette.categorical.length; i++) {
      const candidate = palette.categorical[(start + i) % palette.categorical.length] as string;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    return preferred;
  });
}

// ============================================================================ gradientes

/**
 * Gradiente vertical (de cima para baixo) calculado sobre a área do gráfico.
 * Antes do primeiro layout (sem chartArea), usa a cor sólida translúcida.
 */
export function verticalGradient<T extends ChartType = 'bar'>(color: string, top: number, bottom: number) {
  return (context: ScriptableContext<T>): CanvasGradient | string => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return withAlpha(color, (top + bottom) / 2);
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, withAlpha(color, top));
    gradient.addColorStop(1, withAlpha(color, bottom));
    return gradient;
  };
}

/** Gradiente horizontal (barras deitadas, rankings). */
export function horizontalGradient<T extends ChartType = 'bar'>(color: string, start: number, end: number) {
  return (context: ScriptableContext<T>): CanvasGradient | string => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return withAlpha(color, (start + end) / 2);
    const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
    gradient.addColorStop(0, withAlpha(color, start));
    gradient.addColorStop(1, withAlpha(color, end));
    return gradient;
  };
}

// ============================================================================ animações

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Atraso em cascata: cada barra/ponto entra um pouco depois do anterior. */
const staggered = (context: ScriptableContext<ChartType>) =>
  context.type === 'data' && context.mode === 'default' ? context.dataIndex * 45 + context.datasetIndex * 140 : 0;

// ============================================================================ plugins visuais

type GlowDataset = ChartDataset & { glowColor?: string };

/** Brilho suave sob as linhas marcadas com `glowColor` (as fábricas abaixo já marcam). */
const glowPlugin: Plugin = {
  id: 'finappGlow',
  beforeDatasetDraw(chart, args) {
    const glow = (chart.data.datasets[args.index] as GlowDataset).glowColor;
    if (!glow) return;
    const { ctx } = chart;
    ctx.save();
    ctx.shadowColor = withAlpha(glow, 0.45);
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
  },
  afterDatasetDraw(chart, args) {
    if ((chart.data.datasets[args.index] as GlowDataset).glowColor) chart.ctx.restore();
  },
};

/** Linha-guia vertical no ponto em foco (gráficos de barras verticais e linhas). */
const crosshairPlugin: Plugin = {
  id: 'finappCrosshair',
  afterDatasetsDraw(chart) {
    const config = chart.config as { type?: string; options?: { indexAxis?: string } };
    if ((config.type !== 'line' && config.type !== 'bar') || config.options?.indexAxis === 'y') return;
    const first = chart.tooltip?.getActiveElements?.()[0];
    if (!first || !chart.chartArea) return;
    const index = first.index;
    const x = chart.getDatasetMeta(first.datasetIndex).data[index]?.x;
    if (x === undefined) return;
    const { top, bottom } = chart.chartArea;
    const { ctx } = chart;
    const color = readPalette().muted;
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, withAlpha(color, 0));
    gradient.addColorStop(0.5, withAlpha(color, 0.5));
    gradient.addColorStop(1, withAlpha(color, 0));
    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

export interface CenterTextOptions {
  /** Texto pequeno de cima (ex.: "Total"). */
  label?: string;
  /** Valor em centavos; se omitido, soma os dados do primeiro dataset. */
  valueCents?: number;
}

declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    /** Total no centro da rosca (só para rosca). */
    finappCenterText?: TType extends 'doughnut' ? CenterTextOptions | false : never;
  }
}

/** Total no centro da rosca; no hover mostra a fatia em foco. */
const centerTextPlugin: Plugin<'doughnut'> = {
  id: 'finappCenterText',
  afterDatasetsDraw(chart, _args, options: CenterTextOptions | false | undefined) {
    if ((chart.config as { type?: string }).type !== 'doughnut' || options === false) return;
    const arc = chart.getDatasetMeta(0).data[0] as unknown as { x: number; y: number; innerRadius: number } | undefined;
    if (!arc?.innerRadius) return;
    const palette = readPalette();
    const data = (chart.data.datasets[0]?.data ?? []) as number[];
    const active = chart.getActiveElements()[0];
    const value = active
      ? (data[active.index] ?? 0)
      : (options?.valueCents ?? data.reduce((sum, v) => sum + (v ?? 0), 0));
    const label = active ? String(chart.data.labels?.[active.index] ?? '') : (options?.label ?? 'Total');
    const { ctx } = chart;
    const family = Chart.defaults.font.family;
    const size = Math.max(14, Math.min(26, arc.innerRadius * 0.3));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.muted;
    ctx.font = `500 ${Math.round(size * 0.52)}px ${family}`;
    ctx.fillText(label.length > 22 ? `${label.slice(0, 21)}…` : label, arc.x, arc.y - size * 0.62);
    ctx.fillStyle = palette.text;
    ctx.font = `700 ${Math.round(size)}px ${family}`;
    ctx.fillText(formatCents(value), arc.x, arc.y + size * 0.34);
    ctx.restore();
  },
};

declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    /** Valor em reais na ponta de cada barra (rankings). */
    finappValueLabels?: TType extends 'bar' ? boolean : never;
  }
}

/** Escreve o valor na ponta de cada barra; acompanha a animação de crescimento. */
const valueLabelsPlugin: Plugin = {
  id: 'finappValueLabels',
  // Só onde o gráfico pedir explicitamente: `plugins: { finappValueLabels: true }`.
  afterDatasetsDraw(chart) {
    const requested = (chart.config.options?.plugins as { finappValueLabels?: unknown } | undefined)?.finappValueLabels;
    if (requested !== true) return;
    const palette = readPalette();
    const horizontal = (chart.config as { options?: { indexAxis?: string } }).options?.indexAxis === 'y';
    const { ctx } = chart;
    ctx.save();
    ctx.font = `600 11px ${Chart.defaults.font.family}`;
    ctx.fillStyle = palette.text;
    ctx.textBaseline = horizontal ? 'middle' : 'bottom';
    ctx.textAlign = horizontal ? 'left' : 'center';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((bar, i) => {
        const value = ds.data[i];
        if (typeof value !== 'number') return;
        const { x, y } = bar.getProps(['x', 'y'], true) as { x: number; y: number };
        ctx.fillText(formatCents(value), horizontal ? x + 8 : x, horizontal ? y : y - 6);
      });
    });
    ctx.restore();
  },
};

// ============================================================================ tooltip de vidro

const TOOLTIP_CLASS = 'finapp-chart-tooltip';

/**
 * Tooltip HTML com efeito de vidro (fundo translúcido + desfoque) que desliza até o ponto em foco.
 * Montado com textContent (nunca innerHTML): nomes de categorias e descrições vêm do usuário.
 */
export function glassTooltip(context: { chart: Chart; tooltip: TooltipModel<ChartType> }): void {
  const { chart, tooltip } = context;
  const parent = chart.canvas.parentElement;
  if (!parent) return;
  const palette = readPalette();
  let element = parent.querySelector<HTMLDivElement>(`.${TOOLTIP_CLASS}`);
  if (!element) {
    element = document.createElement('div');
    element.className = TOOLTIP_CLASS;
    element.setAttribute('role', 'presentation');
    Object.assign(element.style, {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: '5',
      opacity: '0',
      minWidth: '160px',
      padding: '10px 12px',
      borderRadius: '12px',
      fontFamily: String(Chart.defaults.font.family ?? 'system-ui'),
      fontSize: '12px',
      lineHeight: '1.5',
      backdropFilter: 'blur(14px) saturate(1.5)',
      transformOrigin: 'center bottom',
      transition: 'opacity 160ms ease, transform 160ms ease, left 140ms ease-out, top 140ms ease-out',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    });
    element.style.setProperty('-webkit-backdrop-filter', 'blur(14px) saturate(1.5)');
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(element);
  }
  Object.assign(element.style, {
    background: withAlpha(palette.surface, 0.72),
    border: `1px solid ${withAlpha(palette.border, 0.8)}`,
    boxShadow: `0 12px 32px ${withAlpha('#000000', 0.22)}, inset 0 1px 0 ${withAlpha('#ffffff', 0.06)}`,
    color: palette.text,
  });

  // Rosca (o centro já mostra a fatia em foco) e rankings com rótulos de valor: o tooltip só repetiria
  // a informação e cobriria o gráfico.
  const options = chart.config.options as { plugins?: { finappValueLabels?: boolean } } | undefined;
  const redundant =
    (chart.config as { type?: string }).type === 'doughnut' || options?.plugins?.finappValueLabels === true;
  if (tooltip.opacity === 0 || redundant) {
    element.style.opacity = '0';
    element.style.transform = 'scale(0.96)';
    return;
  }

  element.replaceChildren();
  for (const line of tooltip.title ?? []) {
    const title = document.createElement('div');
    title.textContent = line;
    Object.assign(title.style, {
      fontWeight: '600',
      color: palette.muted,
      marginBottom: '6px',
      letterSpacing: '0.02em',
    });
    element.appendChild(title);
  }
  tooltip.dataPoints.forEach((point, i) => {
    const amount = typeof point.raw === 'number' ? point.raw : Number(point.parsed);
    if (!Number.isFinite(amount)) return;
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' });
    const left = document.createElement('span');
    Object.assign(left.style, { display: 'inline-flex', alignItems: 'center', gap: '8px' });
    const dot = document.createElement('span');
    const colors = tooltip.labelColors[i];
    const swatch = typeof colors?.borderColor === 'string' ? colors.borderColor : palette.muted;
    Object.assign(dot.style, {
      width: '9px',
      height: '9px',
      borderRadius: '50%',
      background: swatch,
      boxShadow: `0 0 0 3px ${withAlpha(swatch, 0.22)}`,
    });
    const name = document.createElement('span');
    name.textContent = String(point.dataset.label || point.label || '');
    left.append(dot, name);
    const value = document.createElement('strong');
    value.textContent = formatCents(amount);
    row.append(left, value);
    element.appendChild(row);
  });

  // Posição: acima do ponto (ou abaixo, se não couber); ao lado da barra nos rankings;
  // sempre dentro do gráfico, para nunca vazar do cartão.
  const gap = 12;
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const bounds = { width: parent.clientWidth, height: parent.clientHeight };
  const x = chart.canvas.offsetLeft + tooltip.caretX;
  const config = chart.config as { type?: string; options?: { indexAxis?: string } };
  const horizontal = config.options?.indexAxis === 'y';
  // Barras verticais e linhas: ancora no TOPO do elemento mais alto em foco (o padrão do Chart.js é o
  // meio da barra, e o tooltip acabava cobrindo as barras).
  // `getProps(…, true)` dá a posição FINAL (durante a animação de entrada `element.y` ainda está no meio).
  const tops = tooltip.dataPoints
    .map((point) => point.element.getProps(['y'], true).y as number | undefined)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const anchorY = horizontal || config.type === 'doughnut' || tops.length === 0 ? tooltip.caretY : Math.min(...tops);
  const y = chart.canvas.offsetTop + anchorY;
  let left: number;
  let top: number;
  if (horizontal) {
    left = x + gap + width <= bounds.width ? x + gap : x - gap - width;
    top = Math.min(Math.max(y - height / 2, 0), bounds.height - height);
  } else {
    left = Math.min(Math.max(x - width / 2, 0), bounds.width - width);
    // Pode subir sobre o cabeçalho do cartão (espaço livre acima do gráfico).
    const headroom = 72;
    top = y - gap - height >= -headroom ? y - gap - height : y + gap;
  }
  element.style.left = `${Math.max(0, left)}px`;
  element.style.top = `${top}px`;
  element.style.transform = 'scale(1)';
  element.style.opacity = '1';
}

// ============================================================================ registro e padrões

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
  glowPlugin,
  crosshairPlugin,
  centerTextPlugin as Plugin,
  valueLabelsPlugin,
);

/** Gerador de legenda original do Chart.js (para reaproveitar e só ajustar as cores). */
const baseLegendLabels = Chart.defaults.plugins.legend.labels.generateLabels;

/** Texto de um item de tooltip: centavos em reais. */
export function moneyLabel(item: TooltipItem<'bar' | 'line' | 'doughnut'>): string {
  const label = item.dataset.label || item.label;
  const value = typeof item.raw === 'number' ? item.raw : Number(item.parsed);
  return `${label}: ${formatCents(value)}`;
}

/** Aplica o tema atual aos padrões do Chart.js. Chamado na montagem e quando o tema muda. */
export function applyChartTheme(root: HTMLElement = document.documentElement): Palette {
  const palette = readPalette(root);
  const defaults = Chart.defaults;
  const reduced = prefersReducedMotion();

  defaults.font.family = getComputedStyle(root).getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif';
  defaults.font.size = 12;
  defaults.color = palette.muted;
  defaults.borderColor = withAlpha(palette.grid, 0.9);
  defaults.maintainAspectRatio = false;
  defaults.layout.padding = { top: 8, right: 8, bottom: 0, left: 0 };

  // Entrada suave e em cascata; hover com transição curta; nada disso para quem pediu menos movimento.
  // Atenção: os objetos de animação do Chart.js são ALTERADOS, nunca substituídos (substituir apaga
  // configurações internas do motor de animação e quebra a renderização).
  Object.assign(defaults.animation as object, {
    duration: reduced ? 0 : 900,
    easing: 'easeOutQuart',
    delay: reduced ? 0 : staggered,
  });
  const active = defaults.transitions.active;
  if (active) active.animation.duration = reduced ? 0 : 220;
  // A animação da rosca fica nos padrões do tipo de dataset (Chart.js 4).
  const doughnutAnimation = (Chart.defaults.datasets.doughnut as { animation?: object } | undefined)?.animation;
  if (doughnutAnimation)
    Object.assign(doughnutAnimation, {
      animateRotate: !reduced,
      animateScale: !reduced,
      duration: reduced ? 0 : 1100,
      easing: 'easeOutQuart',
    });

  defaults.interaction = { mode: 'index', intersect: false, axis: 'x', includeInvisible: false };
  Chart.overrides.doughnut.interaction = { mode: 'nearest', intersect: true } as never;

  const legend = defaults.plugins.legend;
  legend.position = 'bottom';
  legend.labels.usePointStyle = true;
  legend.labels.pointStyle = 'circle';
  legend.labels.boxWidth = 8;
  legend.labels.boxHeight = 8;
  legend.labels.padding = 18;
  legend.labels.color = palette.text;
  legend.labels.font = { size: 12, weight: 500 };
  legend.labels.generateLabels = (chart) => {
    const items = baseLegendLabels(chart);
    if ((chart.config as { type?: string }).type === 'doughnut') return items;
    return items.map((item) => {
      const ds = chart.data.datasets[item.datasetIndex ?? -1];
      const solid = typeof ds?.borderColor === 'string' ? ds.borderColor : undefined;
      return solid ? { ...item, fillStyle: solid, strokeStyle: solid, lineWidth: 0 } : item;
    });
  };

  const tooltip = defaults.plugins.tooltip;
  tooltip.enabled = false;
  tooltip.external = glassTooltip as never;
  tooltip.callbacks.label = moneyLabel as never;

  defaults.elements.bar.borderRadius = 8;
  defaults.elements.bar.borderSkipped = false;
  defaults.elements.line.borderWidth = 2.5;
  defaults.elements.line.tension = 0.4;
  defaults.elements.line.capBezierPoints = true;
  defaults.elements.point.radius = 0;
  defaults.elements.point.hoverRadius = 6;
  defaults.elements.point.hitRadius = 18;
  defaults.elements.point.hoverBorderWidth = 3;
  defaults.elements.point.backgroundColor = palette.surface;
  defaults.elements.arc.borderWidth = 0;
  defaults.elements.arc.borderRadius = 6;

  defaults.scale.grid.color = withAlpha(palette.grid, 0.9);
  defaults.scale.ticks.padding = 8;
  return palette;
}

// ============================================================================ eixos

/** Eixo de valores em centavos, com ticks em reais compactos ("R$ 1,2 mil") e grade tracejada. */
export const moneyAxis: ScaleOptions<'linear'> = {
  beginAtZero: true,
  border: { display: false, dash: [4, 4] },
  grid: { drawTicks: false },
  ticks: { callback: (value) => formatCentsCompact(Number(value)), maxTicksLimit: 6 },
} as ScaleOptions<'linear'>;

/** Eixo de categorias sem grade (meses, nomes). */
export const categoryAxis: ScaleOptions<'category'> = {
  grid: { display: false },
  border: { display: false },
  ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 14 },
} as ScaleOptions<'category'>;

/** "2026-10" → "out/26" para eixos de meses. */
export const monthLabels = (months: readonly string[]): string[] => months.map(formatMonth);

// ============================================================================ fábricas de datasets

const colorOf = (palette: Palette, color: SemanticColor | string) =>
  (palette as unknown as Record<string, string>)[color] ?? color;

/** Datasets já estilizados: as telas só informam rótulo, dados e cor (semântica ou de categoria). */
export const dataset = {
  /** Barras com gradiente vertical; no hover ficam mais opacas. */
  bar(palette: Palette, label: string, data: number[], color: SemanticColor | string): ChartDataset<'bar'> {
    const base = colorOf(palette, color);
    return {
      label,
      data,
      backgroundColor: verticalGradient(base, 0.95, 0.3),
      hoverBackgroundColor: verticalGradient(base, 1, 0.75),
      borderColor: base,
      borderWidth: 0,
      maxBarThickness: 30,
      categoryPercentage: 0.72,
      barPercentage: 0.88,
    };
  },

  /** Barras deitadas (rankings): uma cor por item, gradiente da esquerda para a direita. */
  ranking(label: string, data: number[], colors: string[]): ChartDataset<'bar'> {
    return {
      label,
      data,
      backgroundColor: (context: ScriptableContext<'bar'>) =>
        horizontalGradient(colors[context.dataIndex] ?? '#888888', 0.3, 0.95)(context),
      hoverBackgroundColor: (context: ScriptableContext<'bar'>) =>
        horizontalGradient(colors[context.dataIndex] ?? '#888888', 0.6, 1)(context),
      borderColor: colors,
      borderWidth: 0,
      maxBarThickness: 22,
    };
  },

  /** Área: linha com brilho e preenchimento em gradiente que some na base. */
  area(palette: Palette, label: string, data: number[], color: SemanticColor | string): ChartDataset<'line'> {
    const base = colorOf(palette, color);
    return {
      label,
      data,
      borderColor: base,
      backgroundColor: verticalGradient<'line'>(base, 0.4, 0),
      fill: 'origin',
      pointHoverBackgroundColor: palette.surface,
      pointHoverBorderColor: base,
      glowColor: base,
    } as ChartDataset<'line'>;
  },

  /** Linha (comparações, metas); `dashed` para linhas de referência. */
  line(
    palette: Palette,
    label: string,
    data: number[],
    color: SemanticColor | string,
    options: { dashed?: boolean } = {},
  ): ChartDataset<'line'> {
    const base = colorOf(palette, color);
    return {
      label,
      data,
      borderColor: base,
      backgroundColor: base,
      fill: false,
      pointHoverBackgroundColor: palette.surface,
      pointHoverBorderColor: base,
      ...(options.dashed ? { borderDash: [6, 6], borderWidth: 1.5, pointHoverRadius: 0 } : { glowColor: base }),
    } as ChartDataset<'line'>;
  },

  /** Rosca: fatias espaçadas e arredondadas, que se destacam ao passar o mouse. */
  doughnut(label: string, data: number[], colors: string[]): ChartDataset<'doughnut'> {
    return {
      label,
      data,
      backgroundColor: colors.map((c) => withAlpha(c, 0.86)),
      hoverBackgroundColor: colors,
      borderColor: colors,
      spacing: 3,
      hoverOffset: 14,
    };
  },
};

/**
 * Só para a pré-visualização (/dev/charts): ativa o hover de todos os gráficos da página no item
 * `index`, para revisar o tooltip e os efeitos sem mouse (capturas de tela automatizadas).
 */
export function previewHover(index: number): void {
  for (const canvas of document.querySelectorAll('canvas')) {
    const chart = Chart.getChart(canvas);
    if (!chart) continue;
    const size = chart.data.labels?.length ?? 0;
    if (size === 0) continue;
    const at = index % size;
    const active = chart.data.datasets
      .map((_, datasetIndex) => ({ datasetIndex, index: at }))
      .filter((a) => !chart.getDatasetMeta(a.datasetIndex).hidden);
    const elements = (chart.config as { type?: string }).type === 'doughnut' ? active.slice(0, 1) : active;
    chart.setActiveElements(elements);
    const point = chart.getDatasetMeta(0).data[at];
    chart.tooltip?.setActiveElements(elements, { x: point?.x ?? 0, y: point?.y ?? 0 });
    chart.update();
  }
}
