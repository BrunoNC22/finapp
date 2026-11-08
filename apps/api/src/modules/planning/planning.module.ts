import { Module } from '@nestjs/common';
import { Db } from 'mongodb';
import { Clock } from '../../shared/application/clock.js';
import { IdGenerator } from '../../shared/application/id-generator.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { UuidIdGenerator } from '../../shared/infrastructure/uuid-id-generator.js';
import { ListIncomeEntries } from '../ledger/application/use-cases/list-income-entries.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { IncomeLedger, IncomeSourceRepository } from './application/ports/income-ports.js';
import {
  CreateIncomeSource,
  DeleteIncomeSource,
  GetIncomeOverview,
  UpdateIncomeSource,
} from './application/use-cases/income.js';
import { LedgerIncomeAdapter, MongoIncomeSourceRepository } from './infrastructure/income-adapters.js';
import { IncomeController } from './presentation/income.controller.js';

/** Planejamento: fontes de renda e cenários (e, em seguida, metas e viabilidade). */
@Module({
  imports: [LedgerModule],
  controllers: [IncomeController],
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
    {
      provide: GetIncomeOverview,
      useFactory: (s: IncomeSourceRepository, l: IncomeLedger, c: Clock) => new GetIncomeOverview(s, l, c),
      inject: [IncomeSourceRepository, IncomeLedger, Clock],
    },
  ],
})
export class PlanningModule {}
