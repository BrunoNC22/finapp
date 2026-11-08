import { Module } from '@nestjs/common';
import { Db } from 'mongodb';
import { Clock } from '../../shared/application/clock.js';
import { IdGenerator } from '../../shared/application/id-generator.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { UuidIdGenerator } from '../../shared/infrastructure/uuid-id-generator.js';
import { GetAvailableBalance, GetCostOfLiving } from '../ledger/application/use-cases/cost-of-living.js';
import { ListIncomeEntries } from '../ledger/application/use-cases/list-income-entries.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { GoalRepository, HouseholdFinances } from './application/ports/goal-ports.js';
import { IncomeLedger, IncomeSourceRepository } from './application/ports/income-ports.js';
import {
  CreateGoal,
  DeleteGoal,
  GetGoalPlan,
  GetRequiredIncome,
  ReorderGoals,
  ReplaceGoal,
} from './application/use-cases/goals.js';
import {
  CreateIncomeSource,
  DeleteIncomeSource,
  GetIncomeOverview,
  UpdateIncomeSource,
} from './application/use-cases/income.js';
import { LedgerHouseholdFinances, MongoGoalRepository } from './infrastructure/goal-adapters.js';
import { LedgerIncomeAdapter, MongoIncomeSourceRepository } from './infrastructure/income-adapters.js';
import { GoalsController } from './presentation/goals.controller.js';
import { IncomeController } from './presentation/income.controller.js';

/** Planejamento: fontes de renda e cenários (e, em seguida, metas e viabilidade). */
@Module({
  imports: [LedgerModule],
  controllers: [IncomeController, GoalsController],
  providers: [
    { provide: Clock, useFactory: () => new SystemClock() },
    { provide: IdGenerator, useFactory: () => new UuidIdGenerator() },
    { provide: IncomeSourceRepository, useFactory: (db: Db) => new MongoIncomeSourceRepository(db), inject: [Db] },
    {
      provide: IncomeLedger,
      useFactory: (entries: ListIncomeEntries) => new LedgerIncomeAdapter(entries),
      inject: [ListIncomeEntries],
    },
    {
      provide: CreateIncomeSource,
      useFactory: (s: IncomeSourceRepository, ids: IdGenerator) => new CreateIncomeSource(s, ids),
      inject: [IncomeSourceRepository, IdGenerator],
    },
    {
      provide: UpdateIncomeSource,
      useFactory: (s: IncomeSourceRepository) => new UpdateIncomeSource(s),
      inject: [IncomeSourceRepository],
    },
    {
      provide: DeleteIncomeSource,
      useFactory: (s: IncomeSourceRepository) => new DeleteIncomeSource(s),
      inject: [IncomeSourceRepository],
    },
    { provide: GoalRepository, useFactory: (db: Db) => new MongoGoalRepository(db), inject: [Db] },
    {
      provide: HouseholdFinances,
      useFactory: (costs: GetCostOfLiving, balance: GetAvailableBalance) => new LedgerHouseholdFinances(costs, balance),
      inject: [GetCostOfLiving, GetAvailableBalance],
    },
    {
      provide: CreateGoal,
      useFactory: (g: GoalRepository, ids: IdGenerator) => new CreateGoal(g, ids),
      inject: [GoalRepository, IdGenerator],
    },
    { provide: ReplaceGoal, useFactory: (g: GoalRepository) => new ReplaceGoal(g), inject: [GoalRepository] },
    { provide: DeleteGoal, useFactory: (g: GoalRepository) => new DeleteGoal(g), inject: [GoalRepository] },
    { provide: ReorderGoals, useFactory: (g: GoalRepository) => new ReorderGoals(g), inject: [GoalRepository] },
    {
      provide: GetGoalPlan,
      useFactory: (g: GoalRepository, s: IncomeSourceRepository, f: HouseholdFinances, c: Clock) =>
        new GetGoalPlan(g, s, f, c),
      inject: [GoalRepository, IncomeSourceRepository, HouseholdFinances, Clock],
    },
    {
      provide: GetRequiredIncome,
      useFactory: (g: GoalRepository, f: HouseholdFinances, c: Clock) => new GetRequiredIncome(g, f, c),
      inject: [GoalRepository, HouseholdFinances, Clock],
    },
    {
      provide: GetIncomeOverview,
      useFactory: (s: IncomeSourceRepository, l: IncomeLedger, c: Clock) => new GetIncomeOverview(s, l, c),
      inject: [IncomeSourceRepository, IncomeLedger, Clock],
    },
  ],
  exports: [IncomeSourceRepository, GoalRepository, GetIncomeOverview, GetGoalPlan, GetRequiredIncome],
})
export class PlanningModule {}
