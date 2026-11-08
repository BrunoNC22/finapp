import { describe, expect, it } from 'vitest';
import { aReport, brl, CATEGORIES } from '../../../test/finance-fixtures';
import { CategoryDirectory } from '../../lib/categories';
import { incomeBars } from './income-sources';

const directory = new CategoryDirectory(CATEGORIES);
const accountName = (id: string) => (id === 'carteira' ? 'Carteira Exemplo' : 'Conta');

describe('incomeBars', () => {
  it('names each source by who paid, or by category and account when nobody did', () => {
    const report = aReport();
    report.incomeSources = [
      { key: 'cp:1', label: 'Fulano de Tal', total: brl(150000), count: 3 },
      {
        key: 'acc:carteira:renda.servicos',
        accountId: 'carteira',
        categoryId: 'renda.servicos',
        total: brl(5000),
        count: 1,
      },
    ];
    expect(incomeBars(report, directory, accountName)).toEqual([
      { label: 'Fulano de Tal', cents: 150000, count: 3 },
      { label: 'Serviços e freelas · Carteira Exemplo', cents: 5000, count: 1 },
    ]);
  });

  it('folds the smallest sources into "Outras fontes"', () => {
    const report = aReport();
    report.incomeSources = [5, 4, 3, 2].map((n) => ({
      key: `cp:${n}`,
      label: `Fonte ${n}`,
      total: brl(n * 100),
      count: 1,
    }));
    const bars = incomeBars(report, directory, accountName, 3);
    expect(bars.map((b) => [b.label, b.cents, b.count])).toEqual([
      ['Fonte 5', 500, 1],
      ['Fonte 4', 400, 1],
      ['Outras fontes', 500, 2],
    ]);
  });
});
