import { Money } from '../../../../shared/kernel/money.js';
import type { Transaction } from '../transaction.js';

/**
 * Relatórios sobre RENDA REAL e GASTO REAL: transferências entre contas do usuário e lançamentos
 * ignorados nunca entram. Estornos (classificados como gasto, valor positivo) abatem o gasto.
 * "Gasto" é sempre reportado como valor positivo.
 */

const isExpense = (t: Transaction) => t.classification === 'expense';
const isIncome = (t: Transaction) => t.classification === 'income';
const inMonth = (month: string) => (t: Transaction) => t.occurredOn.monthKey === month;
const spentOf = (txs: readonly Transaction[]) => Money.sum(txs.map((t) => t.amount)).negate();

export interface MonthFlow {
  readonly month: string;
  readonly income: Money;
  readonly spending: Money;
  readonly net: Money;
}

export function cashFlow(transactions: readonly Transaction[], months: readonly string[]): MonthFlow[] {
  return months.map((month) => {
    const ofMonth = transactions.filter(inMonth(month));
    const income = Money.sum(ofMonth.filter(isIncome).map((t) => t.amount));
    const spending = spentOf(ofMonth.filter(isExpense));
    return { month, income, spending, net: income.subtract(spending) };
  });
}

export interface CategorySpending {
  /** null = sem categoria. */
  readonly categoryId: string | null;
  readonly groupId: string | null;
  readonly spent: Money;
  readonly count: number;
  /** Média mensal dos meses anteriores (padrão: 3). */
  readonly previousAverage: Money;
  /** Variação percentual sobre a média anterior; null se não havia gasto antes. */
  readonly changePercent: number | null;
}

const previousMonths = (month: string, count: number): string[] => {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const index = year * 12 + (m - 1) - (i + 1);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
};

export function categoryBreakdown(
  transactions: readonly Transaction[],
  month: string,
  compareMonths = 3,
): CategorySpending[] {
  const expenses = transactions.filter(isExpense);
  const keyOf = (t: Transaction) => t.category?.categoryId ?? null;
  const current = expenses.filter(inMonth(month));
  const before = previousMonths(month, compareMonths);
  const keys = [...new Set(current.map(keyOf))];

  return keys
    .map((categoryId) => {
      const ofCategory = expenses.filter((t) => keyOf(t) === categoryId);
      const spent = spentOf(ofCategory.filter(inMonth(month)));
      const previousTotal = spentOf(ofCategory.filter((t) => before.includes(t.occurredOn.monthKey)));
      const previousAverage = Money.fromCents(Math.round(previousTotal.cents / compareMonths));
      return {
        categoryId,
        groupId: categoryId ? (categoryId.split('.')[0] ?? null) : null,
        spent,
        count: ofCategory.filter(inMonth(month)).length,
        previousAverage,
        changePercent: previousAverage.isPositive()
          ? Math.round(((spent.cents - previousAverage.cents) / previousAverage.cents) * 100)
          : null,
      };
    })
    .sort((a, b) => b.spent.cents - a.spent.cents || String(a.categoryId).localeCompare(String(b.categoryId)));
}

export interface KeyedSpending {
  readonly key: string;
  readonly spent: Money;
  readonly count: number;
}

/** Gasto do mês agrupado por qualquer chave (conta, forma de pagamento…). */
export function breakdownBy(
  transactions: readonly Transaction[],
  month: string,
  keyOf: (t: Transaction) => string,
): KeyedSpending[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions.filter(isExpense).filter(inMonth(month))) {
    const key = keyOf(t);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups]
    .map(([key, txs]) => ({ key, spent: spentOf(txs), count: txs.length }))
    .sort((a, b) => b.spent.cents - a.spent.cents || a.key.localeCompare(b.key));
}

export function topExpenses(transactions: readonly Transaction[], month: string, limit = 5): Transaction[] {
  return transactions
    .filter(isExpense)
    .filter(inMonth(month))
    .filter((t) => t.amount.isNegative())
    .sort((a, b) => a.amount.cents - b.amount.cents)
    .slice(0, limit);
}

export interface Outlier {
  readonly transaction: Transaction;
  /** Quantas vezes o valor é maior que a mediana da categoria. */
  readonly timesTheMedian: number;
}

/**
 * Gastos do mês muito acima do habitual na mesma categoria (≥ `factor` × mediana do histórico anterior)
 * e acima de um valor mínimo.
 * Exige um histórico mínimo para não acusar tudo como anomalia.
 */
export function outliers(
  transactions: readonly Transaction[],
  month: string,
  factor = 4,
  minHistory = 5,
  /** Abaixo disso não vale alertar (calibrado com dados reais: R$ 100). */
  minCents = 10_000,
): Outlier[] {
  const expenses = transactions.filter(isExpense).filter((t) => t.amount.isNegative() && t.category);
  const result: Outlier[] = [];
  for (const t of expenses.filter(inMonth(month))) {
    const history = expenses
      .filter((h) => h.category?.categoryId === t.category?.categoryId && h.occurredOn.monthKey < month)
      .map((h) => -h.amount.cents)
      .sort((a, b) => a - b);
    if (history.length < minHistory || -t.amount.cents < minCents) continue;
    const median = history[Math.floor(history.length / 2)] as number;
    const times = -t.amount.cents / median;
    if (times >= factor) result.push({ transaction: t, timesTheMedian: Math.round(times * 10) / 10 });
  }
  return result.sort((a, b) => b.timesTheMedian - a.timesTheMedian);
}
