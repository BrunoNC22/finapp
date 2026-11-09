import { Module } from '@nestjs/common';
import { Db } from 'mongodb';
import { Clock } from '../../shared/application/clock.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { AnalysisLog, GetAnalysisReminder, RecordMonthlyAnalysis } from './application/monthly-analysis-routine.js';
import { MongoAnalysisLog } from './infrastructure/mongo-analysis-log.js';
import { RoutineController } from './presentation/routine.controller.js';

/** Rotina mensal: lembrete no app da análise financeira do mês (feita pela skill do Claude Code). */
@Module({
  controllers: [RoutineController],
  providers: [
    { provide: Clock, useFactory: () => new SystemClock() },
    { provide: AnalysisLog, useFactory: (db: Db) => new MongoAnalysisLog(db), inject: [Db] },
    {
      provide: GetAnalysisReminder,
      useFactory: (log: AnalysisLog, clock: Clock) => new GetAnalysisReminder(log, clock),
      inject: [AnalysisLog, Clock],
    },
    {
      provide: RecordMonthlyAnalysis,
      useFactory: (log: AnalysisLog, clock: Clock) => new RecordMonthlyAnalysis(log, clock),
      inject: [AnalysisLog, Clock],
    },
  ],
  exports: [RecordMonthlyAnalysis],
})
export class RoutineModule {}
