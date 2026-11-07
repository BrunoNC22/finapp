import { describe, expect, it } from 'vitest';
import { aReport, brl, CATEGORIES } from '../../../test/finance-fixtures';
import { CategoryDirectory } from '../../lib/categories';
import { spendingByGroup, spendingHighlights } from './highlights';

const directory = new CategoryDirectory(CATEGORIES);

describe('spendingHighlights', () => {
  it('points out categories that ran away from their average, ignoring small changes', () => {
    const highlights = spendingHighlights(aReport(), directory);
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.text).toMatch(/^Delivery \+40% vs média \(\+R\$\s120,00\)$/);
    expect(highlights[0]?.tone).toBe('up');
  });

  it('ignores drops while the month is still in progress', () => {
    const report = aReport();
    report.categories.push({
      categoryId: 'alimentacao.mercado',
      groupId: 'alimentacao',
      spent: brl(10000),
      count: 1,
      previousAverage: brl(60000),
      changePercent: -83,
    });
    expect(spendingHighlights(report, directory, { monthInProgress: true }).map((h) => h.tone)).toEqual(['up']);
  });

  it('also reports big drops, biggest money difference first', () => {
    const report = aReport();
    report.categories.push({
      categoryId: 'alimentacao.mercado',
      groupId: 'alimentacao',
      spent: brl(10000),
      count: 1,
      previousAverage: brl(60000),
      changePercent: -83,
    });
    const [first, second] = spendingHighlights(report, directory);
    expect(first?.tone).toBe('down');
    expect(first?.text).toMatch(/^Mercado -83% vs média/);
    expect(second?.categoryId).toBe('alimentacao.delivery');
  });
});

describe('spendingByGroup', () => {
  it('adds subcategories into their group, largest first, uncategorized included', () => {
    expect(spendingByGroup(aReport(), directory)).toEqual([
      { groupId: 'moradia', label: 'Moradia', cents: 90000 },
      { groupId: 'alimentacao', label: 'Alimentação', cents: 80000 },
      { groupId: null, label: 'Sem categoria', cents: 10000 },
    ]);
  });

  it('folds the tail into "Outros"', () => {
    const slices = spendingByGroup(aReport(), directory, 2);
    expect(slices.map((s) => s.label)).toEqual(['Moradia', 'Outros']);
    expect(slices[1]?.cents).toBe(90000);
  });
});
