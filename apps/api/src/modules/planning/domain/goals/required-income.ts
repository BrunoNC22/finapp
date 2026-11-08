import { Money } from '../../../../shared/kernel/money.js';
import type { YearMonth } from '../../../../shared/kernel/year-month.js';
import type { Goal } from './goal.js';
import { type Baseline, simulatePlan } from './plan-simulator.js';

export interface RequiredIncomeInput {
  /** Na ordem de realização. */
  readonly goals: readonly Goal[];
  readonly baseline: Baseline;
  readonly months: readonly YearMonth[];
  readonly startingSavings: Money;
  readonly minSlackRatio: number;
  /** Começar cada meta até este mês (inclusive). Sem prazo: dentro do horizonte. */
  readonly deadline?: YearMonth;
}

export interface RequiredIncomeStep {
  readonly goalId: string;
  /** Menor renda mensal estável que realiza esta meta e todas as anteriores; ausente se nenhuma no limite resolve. */
  readonly monthlyIncome?: Money;
  /** Mês em que a meta começa com essa renda. */
  readonly startMonth?: YearMonth;
}

/** Teto da busca: acima disso, a meta é considerada fora de alcance. */
const MAX_CENTS = 100_000_000;

/**
 * "Quanto eu preciso ganhar?": para cada meta da sequência (cumulativa), a menor renda mensal ESTÁVEL que a
 * realiza no horizonte (ou até o prazo), com a mesma simulação do plano (juntar a largada, parcelas que se
 * sobrepõem, folga mínima). Busca binária em centavos: mais renda nunca atrasa uma meta.
 */
export function requiredIncome(input: RequiredIncomeInput): RequiredIncomeStep[] {
  return input.goals.map((goal, index) => {
    const prefix = input.goals.slice(0, index + 1);
    const startWith = (cents: number): YearMonth | undefined => {
      const plan = simulatePlan({
        goals: prefix,
        baseline: input.baseline,
        months: input.months,
        income: input.months.map(() => Money.fromCents(cents)),
        startingSavings: input.startingSavings,
        minSlackRatio: input.minSlackRatio,
      });
      const start = plan.goals[index]?.startMonth;
      if (!start || (input.deadline && start.isAfter(input.deadline))) return undefined;
      return start;
    };
    if (!startWith(MAX_CENTS)) return { goalId: goal.id };
    let low = 0;
    let high = MAX_CENTS;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (startWith(middle)) high = middle;
      else low = middle + 1;
    }
    const startMonth = startWith(high) as YearMonth;
    return { goalId: goal.id, monthlyIncome: Money.fromCents(high), startMonth };
  });
}
