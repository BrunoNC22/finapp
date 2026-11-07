import { Chart } from 'chart.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyChartTheme, categoryColor, moneyAxis, moneyLabel, monthLabels, readPalette } from './chart-config';

const plain = (s: string) => s.replace(/ /g, ' ');

describe('chart-config', () => {
  beforeEach(() => {
    const root = document.documentElement;
    root.style.setProperty('--text', '#111111');
    root.style.setProperty('--text-muted', '#555555');
    root.style.setProperty('--chart-grid', '#eeeeee');
    root.style.setProperty('--income', '#00aa00');
    for (let i = 1; i <= 8; i++) root.style.setProperty(`--chart-${i}`, `#00000${i}`);
  });

  it('reads colors from the CSS design tokens (single source of truth)', () => {
    const palette = readPalette();
    expect(palette.income).toBe('#00aa00');
    expect(palette.categorical).toHaveLength(8);
  });

  it('applies the theme to Chart.js defaults', () => {
    applyChartTheme();
    expect(Chart.defaults.color).toBe('#555555');
    expect(Chart.defaults.borderColor).toBe('rgba(238, 238, 238, 0.9)');
    expect(Chart.defaults.plugins.legend.position).toBe('bottom');
  });

  it('tooltips show cents as BRL', () => {
    const item = { dataset: { label: 'Gasto' }, label: 'out/26', raw: 123456, parsed: 123456 } as never;
    expect(plain(moneyLabel(item))).toBe('Gasto: R$ 1.234,56');
  });

  it('money axis and month labels', () => {
    const tick = (moneyAxis.ticks as { callback: (v: number) => string }).callback(120000);
    expect(plain(tick)).toBe('R$ 1,2 mil');
    expect(monthLabels(['2026-09', '2026-10'])).toEqual(['set/26', 'out/26']);
  });

  it('applies transparency to theme colors', async () => {
    const { withAlpha } = await import('./chart-config');
    expect(withAlpha('#0f766e', 0.5)).toBe('rgba(15, 118, 110, 0.5)');
    expect(withAlpha('#abc', 1)).toBe('rgba(170, 187, 204, 1)');
    expect(withAlpha('rgb(1, 2, 3)', 0.2)).toBe('rgba(1, 2, 3, 0.2)');
  });

  it('a category always gets the same color; subcategories share the group color; none is gray', () => {
    const palette = readPalette();
    expect(categoryColor('alimentacao.mercado', palette)).toBe(categoryColor('alimentacao.delivery', palette));
    expect(categoryColor('alimentacao.mercado', palette)).toBe(categoryColor('alimentacao.mercado', palette));
    expect(categoryColor(null, palette)).toBe(palette.transfer);
  });
});
