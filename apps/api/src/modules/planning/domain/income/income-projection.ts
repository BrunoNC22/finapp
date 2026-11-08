import { Money } from '../../../../shared/kernel/money.js';
import type { YearMonth } from '../../../../shared/kernel/year-month.js';
import type { IncomeScenario, ScenarioId } from './income-scenario.js';
import type { IncomeSource } from './income-source.js';

export interface ScenarioProjection {
  readonly id: ScenarioId;
  readonly name: string;
  /** Renda total por mês (mesma ordem de `months`). */
  readonly totals: Money[];
  readonly bySource: { readonly sourceId: string; readonly amounts: Money[] }[];
}

export interface IncomeProjection {
  readonly months: YearMonth[];
  readonly scenarios: ScenarioProjection[];
}

/** Renda esperada mês a mês em cada cenário, respeitando início e fim de cada fonte. */
export function projectIncome(
  sources: readonly IncomeSource[],
  scenarios: readonly IncomeScenario[],
  from: YearMonth,
  count: number,
): IncomeProjection {
  const months = from.sequence(count);
  return {
    months,
    scenarios: scenarios.map((scenario) => {
      const bySource = sources
        .filter((source) => scenario.includes(source))
        .map((source) => ({
          sourceId: source.id,
          amounts: months.map((m) => (source.activeIn(m) ? source.expectedMonthly : Money.zero())),
        }));
      return {
        id: scenario.id,
        name: scenario.name,
        bySource,
        totals: months.map((_, i) => Money.sum(bySource.map((s) => s.amounts[i] as Money))),
      };
    }),
  };
}
