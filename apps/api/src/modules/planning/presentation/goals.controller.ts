import {
  type GoalCommand,
  GoalCommandSchema,
  type GoalDto,
  type GoalPlanDto,
  GoalPlanQuerySchema,
  type MoneyDto,
  ReorderGoalsCommandSchema,
} from '@finapp/contracts';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { Money } from '../../../shared/kernel/money.js';
import { ZodPipe } from '../../../shared/presentation/zod-pipe.js';
import { GoalRepository } from '../application/ports/goal-ports.js';
import { CreateGoal, DeleteGoal, GetGoalPlan, ReorderGoals, ReplaceGoal } from '../application/use-cases/goals.js';
import type { Goal, GoalProps } from '../domain/goals/goal.js';

const money = (value: Money): MoneyDto => ({ cents: value.cents, currency: 'BRL' });
type ParsedGoalCommand = z.output<typeof GoalCommandSchema>;

const toDto = (goal: Goal): GoalDto => {
  const p = goal.props;
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    price: money(p.price),
    downPayment: money(p.downPayment),
    oneTimeCosts: money(p.oneTimeCosts),
    financing: { ...p.financing },
    recurringCosts: p.recurringCosts.map((c) => ({
      name: c.name,
      monthly: money(c.monthly),
      ...(c.replacesCategoryId ? { replacesCategoryId: c.replacesCategoryId } : {}),
    })),
    upfront: money(goal.upfront()),
    installment: money(goal.installment()),
    totalCost: money(goal.totalCost()),
  };
};

const toProps = (c: ParsedGoalCommand): Omit<GoalProps, 'id'> => ({
  name: c.name,
  kind: c.kind,
  price: Money.fromCents(c.priceCents),
  downPayment: Money.fromCents(c.downPaymentCents),
  oneTimeCosts: Money.fromCents(c.oneTimeCostsCents),
  financing: c.financing,
  recurringCosts: c.recurringCosts.map((r) => ({
    name: r.name,
    monthly: Money.fromCents(r.monthlyCents),
    ...(r.replacesCategoryId ? { replacesCategoryId: r.replacesCategoryId } : {}),
  })),
});

@Controller('goals')
export class GoalsController {
  constructor(
    @Inject(GoalRepository) private readonly goals: GoalRepository,
    @Inject(CreateGoal) private readonly create: CreateGoal,
    @Inject(ReplaceGoal) private readonly replace: ReplaceGoal,
    @Inject(DeleteGoal) private readonly remove: DeleteGoal,
    @Inject(ReorderGoals) private readonly reorderGoals: ReorderGoals,
    @Inject(GetGoalPlan) private readonly plan: GetGoalPlan,
  ) {}

  @Get()
  async list(): Promise<GoalDto[]> {
    return (await this.goals.findAll()).map(toDto);
  }

  @Post()
  async add(@Body(new ZodPipe(GoalCommandSchema)) body: GoalCommand): Promise<GoalDto> {
    return toDto(await this.create.execute(toProps(body as ParsedGoalCommand)));
  }

  @Put(':id')
  async change(@Param('id') id: string, @Body(new ZodPipe(GoalCommandSchema)) body: GoalCommand): Promise<GoalDto> {
    return toDto(await this.replace.execute(id, toProps(body as ParsedGoalCommand)));
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    await this.remove.execute(id);
  }

  /** Nova ordem de realização (todas as metas, na ordem desejada). */
  @Post('order')
  @HttpCode(204)
  async reorder(@Body(new ZodPipe(ReorderGoalsCommandSchema)) body: { ids: string[] }): Promise<void> {
    await this.reorderGoals.execute(body.ids);
  }

  @Get('plan')
  async get(
    @Query(new ZodPipe(GoalPlanQuerySchema))
    query: { months: number; startingSavingsCents?: number; minSlackPercent: number },
  ): Promise<GoalPlanDto> {
    const p = await this.plan.execute({
      months: query.months,
      minSlackPercent: query.minSlackPercent,
      ...(query.startingSavingsCents !== undefined
        ? { startingSavings: Money.fromCents(query.startingSavingsCents) }
        : {}),
    });
    return {
      months: p.months.map(String),
      startingSavings: money(p.startingSavings),
      minSlackPercent: p.minSlackPercent,
      baseline: { monthlySpending: money(p.baseline.monthlySpending), months: p.baseline.months },
      scenarios: p.scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        goals: s.goals.map((g) => ({
          goalId: g.goalId,
          status: g.status,
          ...(g.startMonth ? { startMonth: g.startMonth.toString() } : {}),
          ...(g.monthsWaiting !== undefined ? { monthsWaiting: g.monthsWaiting } : {}),
          monthlyCost: money(g.monthlyCost),
          monthlyCostAfterPayments: money(g.monthlyCostAfterPayments),
          alerts: g.alerts,
          ...(g.monthlyGap ? { monthlyGap: money(g.monthlyGap) } : {}),
          levers: g.levers.map((l) =>
            l.kind === 'cut'
              ? { kind: 'cut' as const, categoryId: l.categoryId, amount: money(l.amount) }
              : { kind: 'extra_income' as const, amount: money(l.amount) },
          ),
        })),
        timeline: s.timeline.map((m) => ({
          month: m.month.toString(),
          income: money(m.income),
          spending: money(m.spending),
          surplus: money(m.surplus),
          savings: money(m.savings),
        })),
      })),
    };
  }
}
