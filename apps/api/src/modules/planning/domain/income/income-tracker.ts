import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import type { IncomeRecord } from './income-record.js';
import type { IncomeSource } from './income-source.js';

/**
 * `paid`: ≥ 90% do esperado · `partial`: pagou menos · `missing`: mês passado sem pagamento ·
 * `waiting`: mês corrente (ou futuro) ainda sem pagamento · `not_expected`: fonte fora do período.
 */
export type IncomeTrackingStatus = 'paid' | 'partial' | 'missing' | 'waiting' | 'not_expected';

export interface SourceTracking {
  readonly sourceId: string;
  readonly expected: Money;
  readonly observed: Money;
  readonly status: IncomeTrackingStatus;
}

export interface IncomeSuggestion {
  /** Nome da contraparte (ou a descrição) que paga com frequência e ainda não é uma fonte. */
  readonly name: string;
  readonly months: number;
  readonly averageMonthly: Money;
}

export interface IncomeTracking {
  readonly month: YearMonth;
  readonly sources: SourceTracking[];
  /** Renda do mês que nenhuma fonte reconhece. */
  readonly unrecognized: Money;
  readonly suggestions: IncomeSuggestion[];
}

const PAID_RATIO = 0.9;
/** Janela e mínimos para sugerir uma fonte nova (evita sugerir rendimentos de centavos). */
const SUGGESTION_WINDOW_MONTHS = 3;
const SUGGESTION_MIN_MONTHS = 2;
const SUGGESTION_MIN_AVERAGE = Money.fromReais(50);

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Compara o que entrou no mês com o que cada fonte deveria pagar e sugere fontes novas. */
export function trackIncome(
  sources: readonly IncomeSource[],
  records: readonly IncomeRecord[],
  month: YearMonth,
  today: LocalDate,
): IncomeTracking {
  const current = YearMonth.of(today);
  const inMonth = records.filter((r) => YearMonth.of(r.occurredOn).equals(month));
  const owner = (r: IncomeRecord) => sources.find((s) => s.matches(r));

  const tracked = sources.map((source): SourceTracking => {
    const observed = Money.sum(inMonth.filter((r) => owner(r) === source).map((r) => r.amount));
    const expected = source.activeIn(month) ? source.expectedMonthly : Money.zero();
    let status: IncomeTrackingStatus;
    if (!source.activeIn(month)) status = observed.isPositive() ? 'paid' : 'not_expected';
    else if (observed.cents >= expected.cents * PAID_RATIO) status = 'paid';
    else if (observed.isPositive()) status = 'partial';
    else status = month.isBefore(current) ? 'missing' : 'waiting';
    return { sourceId: source.id, expected, observed, status };
  });

  return {
    month,
    sources: tracked,
    unrecognized: Money.sum(inMonth.filter((r) => !owner(r)).map((r) => r.amount)),
    suggestions: suggest(
      records.filter((r) => !owner(r)),
      month,
    ),
  };
}

function suggest(unrecognized: readonly IncomeRecord[], month: YearMonth): IncomeSuggestion[] {
  const from = month.addMonths(-(SUGGESTION_WINDOW_MONTHS - 1));
  const groups = new Map<string, { names: Map<string, number>; months: Set<string>; total: Money }>();
  for (const r of unrecognized) {
    const m = YearMonth.of(r.occurredOn);
    if (m.isBefore(from) || m.isAfter(month)) continue;
    const name = r.counterpartyName?.trim() || r.description.trim();
    const key = fold(name);
    const group = groups.get(key) ?? { names: new Map(), months: new Set(), total: Money.zero() };
    group.names.set(name, (group.names.get(name) ?? 0) + 1);
    group.months.add(m.toString());
    group.total = group.total.add(r.amount);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.months.size >= SUGGESTION_MIN_MONTHS)
    .map((g) => ({
      name: [...g.names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
      months: g.months.size,
      averageMonthly: Money.fromCents(Math.round(g.total.cents / g.months.size)),
    }))
    .filter((s) => !s.averageMonthly.isLessThan(SUGGESTION_MIN_AVERAGE))
    .sort((a, b) => b.averageMonthly.cents - a.averageMonthly.cents);
}
