import type { Clock } from '../../../../shared/application/clock.js';
import { NotFoundError } from '../../../../shared/application/errors.js';
import type { IdGenerator } from '../../../../shared/application/id-generator.js';
import { DomainError } from '../../../../shared/kernel/domain-error.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { Money } from '../../../../shared/kernel/money.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import { Goal, type GoalProps } from '../../domain/goals/goal.js';
import { type Baseline, type PlanResult, simulatePlan } from '../../domain/goals/plan-simulator.js';
import { projectIncome } from '../../domain/income/income-projection.js';
import { DEFAULT_SCENARIOS, type ScenarioId } from '../../domain/income/income-scenario.js';
import type { GoalRepository, HouseholdFinances } from '../ports/goal-ports.js';
import type { IncomeSourceRepository } from '../ports/income-ports.js';

export class UnknownGoalError extends NotFoundError {
  constructor(id: string) {
    super(`meta inexistente: ${id}`);
  }
}

export class InvalidGoalOrderError extends DomainError {
  constructor() {
    super('a nova ordem precisa conter exatamente as metas existentes');
  }
}

export class CreateGoal {
  constructor(
    private readonly goals: GoalRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(props: Omit<GoalProps, 'id'>): Promise<Goal> {
    const goal = Goal.create({ id: this.ids.next(), ...props });
    await this.goals.save(goal);
    return goal;
  }
}

export class ReplaceGoal {
  constructor(private readonly goals: GoalRepository) {}

  async execute(id: string, props: Omit<GoalProps, 'id'>): Promise<Goal> {
    if (!(await this.goals.findById(id))) throw new UnknownGoalError(id);
    const goal = Goal.create({ id, ...props });
    await this.goals.save(goal);
    return goal;
  }
}

export class DeleteGoal {
  constructor(private readonly goals: GoalRepository) {}

  async execute(id: string): Promise<void> {
    if (!(await this.goals.delete(id))) throw new UnknownGoalError(id);
  }
}

export class ReorderGoals {
  constructor(private readonly goals: GoalRepository) {}

  async execute(ids: readonly string[]): Promise<void> {
    const current = (await this.goals.findAll()).map((g) => g.id).sort();
    if (current.length !== ids.length || [...ids].sort().some((id, i) => id !== current[i])) {
      throw new InvalidGoalOrderError();
    }
    await this.goals.reorder(ids);
  }
}

export interface GoalPlan {
  readonly months: YearMonth[];
  readonly startingSavings: Money;
  readonly minSlackPercent: number;
  readonly baseline: Baseline & { readonly months: number };
  readonly scenarios: (PlanResult & { readonly id: ScenarioId; readonly name: string })[];
}

/** Meses fechados usados para medir o custo de vida atual. */
const BASELINE_MONTHS = 6;

/**
 * O plano: as metas em sequência, simuladas mês a mês em cada cenário de renda, sobre o custo de vida
 * real dos últimos 6 meses fechados. Começa com o saldo disponível hoje (ou o valor informado).
 */
export class GetGoalPlan {
  constructor(
    private readonly goals: GoalRepository,
    private readonly sources: IncomeSourceRepository,
    private readonly finances: HouseholdFinances,
    private readonly clock: Clock,
    private readonly timeZone = 'America/Sao_Paulo',
  ) {}

  async execute(input: { months: number; startingSavings?: Money; minSlackPercent: number }): Promise<GoalPlan> {
    const current = YearMonth.of(LocalDate.fromInstant(this.clock.now(), this.timeZone));
    const first = current.addMonths(-BASELINE_MONTHS);
    const [goals, sources, baseline, available] = await Promise.all([
      this.goals.findAll(),
      this.sources.findAll(),
      this.finances.costOfLiving(first.firstDay(), current.addMonths(-1).lastDay(), BASELINE_MONTHS),
      input.startingSavings ? Promise.resolve(input.startingSavings) : this.finances.availableBalance(),
    ]);
    const projection = projectIncome(sources, DEFAULT_SCENARIOS, current, input.months);
    return {
      months: projection.months,
      startingSavings: available,
      minSlackPercent: input.minSlackPercent,
      baseline: { ...baseline, months: BASELINE_MONTHS },
      scenarios: projection.scenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        ...simulatePlan({
          goals,
          baseline,
          months: projection.months,
          income: scenario.totals,
          startingSavings: available,
          minSlackRatio: input.minSlackPercent / 100,
        }),
      })),
    };
  }
}
