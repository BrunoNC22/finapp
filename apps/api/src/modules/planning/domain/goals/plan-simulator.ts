import { Money } from '../../../../shared/kernel/money.js';
import type { YearMonth } from '../../../../shared/kernel/year-month.js';
import type { Goal } from './goal.js';

/** Custo de vida atual: gasto médio mensal real e a parte de cada categoria. */
export interface Baseline {
  readonly monthlySpending: Money;
  readonly byCategory: ReadonlyMap<string, Money>;
}

export interface PlanInput {
  /** Na ordem em que o usuário quer realizar. */
  readonly goals: readonly Goal[];
  readonly baseline: Baseline;
  readonly months: readonly YearMonth[];
  /** Renda do cenário, mês a mês (mesma ordem de `months`). */
  readonly income: readonly Money[];
  readonly startingSavings: Money;
  /** Parte da renda que precisa sobrar todo mês com a meta ativa (ex.: 0,1 = 10%). */
  readonly minSlackRatio: number;
}

/** `income_drops`: a renda cai durante as parcelas · `beyond_projection`: as parcelas passam do horizonte projetado. */
export type GoalAlert = 'income_drops' | 'beyond_projection';

export type Lever =
  | { readonly kind: 'extra_income'; readonly amount: Money }
  | { readonly kind: 'cut'; readonly categoryId: string; readonly amount: Money };

export interface GoalOutcome {
  readonly goalId: string;
  /** `scheduled`: cabe e tem mês · `not_feasible`: não cabe no horizonte · `blocked`: espera uma meta anterior que não cabe. */
  readonly status: 'scheduled' | 'not_feasible' | 'blocked';
  readonly startMonth?: YearMonth;
  readonly monthsWaiting?: number;
  /** Efeito no orçamento enquanto há parcelas: parcela + custos novos − gastos substituídos. */
  readonly monthlyCost: Money;
  /** Efeito depois da última parcela. */
  readonly monthlyCostAfterPayments: Money;
  readonly alerts: GoalAlert[];
  /** Quanto falta por mês para caber (com a folga), quando não cabe. */
  readonly monthlyGap?: Money;
  readonly levers: Lever[];
}

export interface PlanMonth {
  readonly month: YearMonth;
  readonly income: Money;
  readonly spending: Money;
  readonly surplus: Money;
  /** Guardado ao fim do mês (já descontado o que as metas usaram para começar). */
  readonly savings: Money;
}

export interface PlanResult {
  readonly goals: GoalOutcome[];
  readonly timeline: PlanMonth[];
}

/** Grupos de categoria tratados como essenciais: não entram como sugestão de corte. */
const ESSENTIAL_GROUPS = ['moradia', 'saude', 'educacao', 'financeiro', 'renda', 'investimentos'];
const MAX_CUT_RATIO = 0.3;
/** Só as maiores alavancas: uma lista longa não ajuda a decidir. */
const MAX_CUTS = 3;
const MIN_TEST_MONTHS = 12;

interface Active {
  readonly goal: Goal;
  readonly start: number;
}

/**
 * Simula as metas EM SEQUÊNCIA, mês a mês: cada uma começa quando (1) o dinheiro da largada está guardado e
 * (2) o orçamento continua com a folga mínima em todos os meses das parcelas (ou 12 meses, o que for maior),
 * com a renda projetada do cenário. Se a renda cair no meio (fim de uma bolsa), a meta espera ou não cabe.
 */
export function simulatePlan(input: PlanInput): PlanResult {
  const { months, income, baseline, minSlackRatio } = input;
  const active: Active[] = [];
  const outcomes: GoalOutcome[] = [];
  const timeline: PlanMonth[] = [];
  let savings = input.startingSavings;
  let next = 0;
  const firstAffordable = new Map<string, number>();

  const spendingAt = (j: number, goals: readonly Active[]): Money => {
    const replaced = new Set(goals.flatMap((a) => a.goal.replacedCategories()));
    let cents = baseline.monthlySpending.cents;
    for (const c of replaced) cents -= baseline.byCategory.get(c)?.cents ?? 0;
    for (const a of goals) {
      if (j < a.start) continue;
      cents += a.goal.recurringAdds().cents;
      if (j - a.start < a.goal.installments()) cents += a.goal.installment().cents;
    }
    return Money.fromCents(cents);
  };
  const shortfall = (j: number, goals: readonly Active[]) =>
    spendingAt(j, goals).cents + Math.round((income[j]?.cents ?? 0) * minSlackRatio) - (income[j]?.cents ?? 0);
  const window = (goal: Goal, start: number) =>
    Array.from({ length: Math.max(goal.installments(), MIN_TEST_MONTHS) }, (_, k) => start + k).filter(
      (j) => j < months.length,
    );

  for (let i = 0; i < months.length; i++) {
    while (next < input.goals.length) {
      const goal = input.goals[next] as Goal;
      if (savings.isLessThan(goal.upfront())) break;
      if (!firstAffordable.has(goal.id)) firstAffordable.set(goal.id, i);
      const candidate = [...active, { goal, start: i }];
      if (window(goal, i).some((j) => shortfall(j, candidate) > 0)) break;
      active.push({ goal, start: i });
      savings = savings.subtract(goal.upfront());
      next++;
    }
    const spending = spendingAt(i, active);
    const surplus = (income[i] ?? Money.zero()).subtract(spending);
    savings = savings.add(surplus);
    timeline.push({ month: months[i] as YearMonth, income: income[i] ?? Money.zero(), spending, surplus, savings });
  }

  input.goals.forEach((goal, index) => {
    const effect = (withPayments: boolean) => {
      const replaced = goal.replacedCategories().reduce((sum, c) => sum + (baseline.byCategory.get(c)?.cents ?? 0), 0);
      return Money.fromCents(goal.recurringAdds().cents - replaced + (withPayments ? goal.installment().cents : 0));
    };
    const started = active.find((a) => a.goal === goal);
    const alerts: GoalAlert[] = [];
    const startIndex = started?.start ?? firstAffordable.get(goal.id) ?? months.length - 1;
    const paymentEnd = startIndex + Math.max(goal.installments(), 1);
    if (paymentEnd > months.length) alerts.push('beyond_projection');
    const payments = Array.from({ length: goal.installments() }, (_, k) => startIndex + k).filter(
      (j) => j < months.length,
    );
    if (payments.some((j) => (income[j]?.cents ?? 0) < (income[startIndex]?.cents ?? 0))) alerts.push('income_drops');

    if (started) {
      outcomes.push({
        goalId: goal.id,
        status: 'scheduled',
        startMonth: months[started.start] as YearMonth,
        monthsWaiting: started.start,
        monthlyCost: effect(true),
        monthlyCostAfterPayments: effect(false),
        alerts,
        levers: [],
      });
      return;
    }
    const blocked = index > next;
    const base = active.filter((a) => a.start <= startIndex);
    const gapCents = Math.max(
      0,
      ...window(goal, startIndex).map((j) => shortfall(j, [...base, { goal, start: startIndex }])),
    );
    outcomes.push({
      goalId: goal.id,
      status: blocked ? 'blocked' : 'not_feasible',
      monthlyCost: effect(true),
      monthlyCostAfterPayments: effect(false),
      alerts,
      ...(gapCents > 0 ? { monthlyGap: Money.fromCents(gapCents) } : {}),
      levers: blocked || gapCents === 0 ? [] : levers(Money.fromCents(gapCents), baseline, goal),
    });
  });

  return { goals: outcomes, timeline };
}

/** Renda extra que fecharia a conta, e cortes de até 30% nas 3 maiores categorias não essenciais. */
function levers(gap: Money, baseline: Baseline, goal: Goal): Lever[] {
  const replaced = new Set(goal.replacedCategories());
  const cuts = [...baseline.byCategory.entries()]
    .filter(([id, avg]) => avg.isPositive() && !replaced.has(id) && !ESSENTIAL_GROUPS.includes(id.split('.')[0] ?? id))
    .sort((a, b) => b[1].cents - a[1].cents);
  const result: Lever[] = [{ kind: 'extra_income', amount: gap }];
  let remaining = gap.cents;
  for (const [categoryId, avg] of cuts) {
    if (remaining <= 0 || result.length > MAX_CUTS) break;
    const amount = Math.min(remaining, Math.round(avg.cents * MAX_CUT_RATIO));
    result.push({ kind: 'cut', categoryId, amount: Money.fromCents(amount) });
    remaining -= amount;
  }
  return result;
}
