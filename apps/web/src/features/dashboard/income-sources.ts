import type { MonthlyReportDto } from '@finapp/contracts';
import type { CategoryDirectory } from '../../lib/categories';

export interface IncomeBar {
  readonly label: string;
  readonly cents: number;
  readonly count: number;
}

/**
 * Barras de "de onde veio o dinheiro": o nome de quem pagou ou, sem contraparte (rendimento,
 * cashback), "Categoria · Conta". As menores viram "Outras fontes".
 */
export function incomeBars(
  report: MonthlyReportDto,
  categories: CategoryDirectory,
  accountName: (accountId: string) => string,
  maxBars = 8,
): IncomeBar[] {
  const bars = report.incomeSources.map((source) => ({
    label:
      source.label ??
      [
        source.categoryId ? categories.name(source.categoryId) : 'Entrada',
        source.accountId ? accountName(source.accountId) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    cents: source.total.cents,
    count: source.count,
  }));
  if (bars.length <= maxBars) return bars;
  const rest = bars.slice(maxBars - 1);
  return [
    ...bars.slice(0, maxBars - 1),
    {
      label: 'Outras fontes',
      cents: rest.reduce((sum, b) => sum + b.cents, 0),
      count: rest.reduce((sum, b) => sum + b.count, 0),
    },
  ];
}
