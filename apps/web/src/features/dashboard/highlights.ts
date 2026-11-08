import type { MonthlyReportDto } from '@finapp/contracts';
import type { CategoryDirectory } from '../../lib/categories';
import { formatCents, formatPercent } from '../../lib/format';

export interface Highlight {
  readonly text: string;
  readonly tone: 'up' | 'down';
  readonly categoryId: string;
}

/** Variação mínima (em %) e diferença mínima em dinheiro para virar destaque. Evita ruído de centavos. */
const MIN_PERCENT = 25;
const MIN_DIFFERENCE_CENTS = 5_000;

/**
 * "Delivery +40% vs média": categorias que fugiram da própria média dos meses anteriores,
 * ordenadas pela diferença em reais (o que mais pesa no bolso primeiro).
 */
export function spendingHighlights(
  report: MonthlyReportDto,
  categories: CategoryDirectory,
  options: { limit?: number; monthInProgress?: boolean } = {},
): Highlight[] {
  const { limit = 3, monthInProgress = false } = options;
  return report.categories
    .flatMap((row) => {
      // Linhas de devolução (gasto negativo) não viram destaque.
      if (!row.categoryId || row.changePercent === null || row.spent.cents <= 0) return [];
      const difference = Math.abs(row.spent.cents) - Math.abs(row.previousAverage.cents);
      if (Math.abs(row.changePercent) < MIN_PERCENT || Math.abs(difference) < MIN_DIFFERENCE_CENTS) return [];
      // Mês em andamento: gastar menos que a média "até agora" não diz nada; gastar mais, sim.
      if (monthInProgress && difference < 0) return [];
      return [{ row, difference }];
    })
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, limit)
    .map(({ row, difference }) => ({
      categoryId: row.categoryId as string,
      tone: difference > 0 ? ('up' as const) : ('down' as const),
      text: `${categories.name(row.categoryId)} ${formatPercent(row.changePercent ?? 0)} vs média (${difference > 0 ? '+' : '−'}${formatCents(Math.abs(difference))})`,
    }));
}

export interface GroupSlice {
  readonly groupId: string | null;
  readonly label: string;
  readonly cents: number;
}

/**
 * Gasto LÍQUIDO do mês por grupo (Alimentação, Transporte…): devoluções abatem do próprio grupo.
 * Do maior para o menor; o resto vira "Outros".
 */
export function spendingByGroup(report: MonthlyReportDto, categories: CategoryDirectory, maxSlices = 7): GroupSlice[] {
  const totals = new Map<string | null, number>();
  for (const row of report.categories) {
    // Com sinal: devoluções (gasto negativo) abatem do próprio grupo.
    totals.set(row.groupId, (totals.get(row.groupId) ?? 0) + row.spent.cents);
  }
  const slices = [...totals.entries()]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([groupId, cents]) => ({ groupId, label: categories.name(groupId), cents }));
  if (slices.length <= maxSlices) return slices;
  const kept = slices.slice(0, maxSlices - 1);
  const rest = slices.slice(maxSlices - 1).reduce((sum, s) => sum + s.cents, 0);
  return [...kept, { groupId: 'outros', label: 'Outros', cents: rest }];
}
