import { describe, expect, it } from 'vitest';
import { goalRepositoryContract } from '../../../../../test/contracts/goal-repository.contract.js';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import {
  InMemoryGoalRepository,
  InMemoryIncomeSourceRepository,
  StubHouseholdFinances,
} from '../../../../../test/doubles/in-memory-planning.js';
import { SequentialIdGenerator } from '../../../../../test/doubles/sequential-id-generator.js';
import { Money } from '../../../../shared/kernel/money.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import { IncomeSource } from '../../domain/income/income-source.js';
import {
  CreateGoal,
  DeleteGoal,
  GetGoalPlan,
  InvalidGoalOrderError,
  ReorderGoals,
  ReplaceGoal,
  UnknownGoalError,
} from './goals.js';

goalRepositoryContract('em memória', async () => new InMemoryGoalRepository());

const r = Money.fromReais;
const cnh = {
  name: 'CNH categoria A',
  kind: 'purchase',
  price: r(1000),
  downPayment: Money.zero(),
  oneTimeCosts: Money.zero(),
  financing: { kind: 'cash' },
  recurringCosts: [],
} as const;

describe('goal use cases', () => {
  it('creates, replaces, reorders and deletes', async () => {
    const goals = new InMemoryGoalRepository();
    const create = new CreateGoal(goals, new SequentialIdGenerator('meta'));
    const a = await create.execute(cnh);
    const b = await create.execute({ ...cnh, name: 'Reserva', kind: 'reserve', price: r(2000) });
    await new ReplaceGoal(goals).execute(a.id, { ...cnh, price: r(1100) });
    expect((await goals.findById(a.id))?.upfront().cents).toBe(110000);

    await new ReorderGoals(goals).execute([b.id, a.id]);
    expect((await goals.findAll()).map((g) => g.name)).toEqual(['Reserva', 'CNH categoria A']);
    await expect(new ReorderGoals(goals).execute([a.id])).rejects.toThrow(InvalidGoalOrderError);

    await new DeleteGoal(goals).execute(a.id);
    await expect(new DeleteGoal(goals).execute(a.id)).rejects.toThrow(UnknownGoalError);
    await expect(new ReplaceGoal(goals).execute('nope', cnh)).rejects.toThrow(UnknownGoalError);
  });

  it('plan: last 6 closed months of real spending, available balance as savings, every scenario', async () => {
    const goals = new InMemoryGoalRepository();
    await new CreateGoal(goals, new SequentialIdGenerator('meta')).execute(cnh);
    const sources = new InMemoryIncomeSourceRepository();
    await sources.save(
      IncomeSource.create({
        id: 'bolsa',
        name: 'Bolsa',
        kind: 'scholarship',
        expectedMonthly: r(2000),
        startsOn: YearMonth.parse('2026-01'),
        risk: 'low',
        status: 'active',
      }),
    );
    const finances = new StubHouseholdFinances({ monthlySpending: r(1500), byCategory: new Map() }, r(400));
    const plan = await new GetGoalPlan(
      goals,
      sources,
      finances,
      new FixedClock(new Date('2026-11-08T15:00:00Z')),
    ).execute({
      months: 12,
      minSlackPercent: 10,
    });

    expect(finances.requested).toEqual([{ from: '2026-05-01', to: '2026-10-31', months: 6 }]);
    expect(plan.startingSavings.cents).toBe(40000);
    expect(plan.scenarios.map((s) => s.id)).toEqual(['floor', 'likely', 'optimistic']);
    // começa com 400; sobra 500/mês → nov fecha 900, dez tem 900 < 1.000 na abertura… começa em jan (1.400)
    const floor = plan.scenarios[0];
    expect(floor?.goals[0]?.startMonth?.toString()).toBe('2027-01');
  });

  it('plan: an informed starting amount replaces the account balance', async () => {
    const finances = new StubHouseholdFinances(undefined, r(400));
    const plan = await new GetGoalPlan(
      new InMemoryGoalRepository(),
      new InMemoryIncomeSourceRepository(),
      finances,
      new FixedClock(new Date('2026-11-08T15:00:00Z')),
    ).execute({ months: 6, minSlackPercent: 10, startingSavings: r(50) });
    expect(plan.startingSavings.cents).toBe(5000);
  });
});
