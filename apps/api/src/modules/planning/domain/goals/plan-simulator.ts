import { Money } from '../../../../shared/kernel/money.js';
import type { YearMonth } from '../../../../shared/kernel/year-month.js';
import { depreciatedValue, type Goal, type TradeInSource } from './goal.js';

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

/** Um bem vendido na largada da meta, no mês em que ela começa. */
export interface TradeInOutcome {
  readonly source: TradeInSource;
  /** Valor estimado de venda, já desvalorizado. */
  readonly value: Money;
  /** Saldo devedor do bem quitado com a venda (zero se já estava pago). */
  readonly payoff: Money;
}

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
  /** Bens vendidos na largada (só quando a meta começa). */
  readonly tradeIns: TradeInOutcome[];
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
  /** Mês em que o bem foi vendido: dali em diante a meta sai do orçamento (parcelas quitadas, sem custos). */
  readonly end?: number;
}

interface Sale {
  readonly outcomes: TradeInOutcome[];
  /** Valor das vendas menos os saldos quitados (pode ser negativo: a diferença sai do guardado). */
  readonly net: Money;
  /** As metas ativas com os bens vendidos encerrados no mês da venda. */
  readonly after: Active[];
}

/** Vende, no mês `month`, os bens que a meta usa para ajudar a pagar. Bem de meta que não está ativa é ignorado. */
function sell(goal: Goal, month: number, active: readonly Active[]): Sale {
  const outcomes: TradeInOutcome[] = [];
  const sold = new Set<Active>();
  for (const { source, annualDepreciationRate: rate } of goal.tradeIns) {
    if (source.kind === 'owned') {
      outcomes.push({ source, value: depreciatedValue(source.currentValue, rate, month), payoff: Money.zero() });
      continue;
    }
    const owner = active.find((a) => a.goal.id === source.goalId && a.end === undefined && a.start <= month);
    if (!owner) continue;
    const age = month - owner.start;
    sold.add(owner);
    outcomes.push({
      source,
      value: depreciatedValue(owner.goal.props.price, rate, age),
      payoff: owner.goal.outstandingBalance(age),
    });
  }
  return {
    outcomes,
    net: Money.sum(outcomes.map((o) => o.value)).subtract(Money.sum(outcomes.map((o) => o.payoff))),
    after: active.map((a) => (sold.has(a) ? { ...a, end: month } : a)),
  };
}

/**
 * Simula as metas EM SEQUÊNCIA, mês a mês: cada uma começa quando (1) o dinheiro da largada está guardado e
 * (2) o orçamento continua com a folga mínima em todos os meses das parcelas (ou 12 meses, o que for maior),
 * com a renda projetada do cenário. Se a renda cair no meio (fim de uma bolsa), a meta espera ou não cabe.
 * Bens vendidos na largada (`tradeIns`) entram no dinheiro da largada, já descontado o saldo que ainda devem,
 * e a meta do bem vendido sai do orçamento a partir daquele mês.
 */
export function simulatePlan(input: PlanInput): PlanResult {
  const { months, income, baseline, minSlackRatio } = input;
  let active: Active[] = [];
  const sales = new Map<string, TradeInOutcome[]>();
  const outcomes: GoalOutcome[] = [];
  const timeline: PlanMonth[] = [];
  let savings = input.startingSavings;
  let next = 0;
  const firstAffordable = new Map<string, number>();

  const spendingAt = (j: number, goals: readonly Active[]): Money => {
    const alive = goals.filter((a) => j >= a.start && (a.end === undefined || j < a.end));
    const replaced = new Set(alive.flatMap((a) => a.goal.replacedCategories()));
    let cents = baseline.monthlySpending.cents;
    for (const c of replaced) cents -= baseline.byCategory.get(c)?.cents ?? 0;
    for (const a of alive) {
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
      const sale = sell(goal, i, active);
      const available = savings.add(sale.net);
      if (available.isLessThan(goal.upfront())) break;
      if (!firstAffordable.has(goal.id)) firstAffordable.set(goal.id, i);
      const candidate = [...sale.after, { goal, start: i }];
      if (window(goal, i).some((j) => shortfall(j, candidate) > 0)) break;
      active = candidate;
      sales.set(goal.id, sale.outcomes);
      savings = available.subtract(goal.upfront());
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
        tradeIns: sales.get(goal.id) ?? [],
      });
      return;
    }
    const blocked = index > next;
    const base = sell(
      goal,
      startIndex,
      active.filter((a) => a.start <= startIndex),
    ).after;
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
      tradeIns: [],
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
