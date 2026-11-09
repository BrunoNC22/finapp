import { Inject, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Clock } from '../../shared/application/clock.js';
import { AppConfig } from '../../shared/config/app-config.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { CreateOpportunity, SaveCareerProfile } from '../career/application/career.js';
import { CareerModule } from '../career/career.module.js';
import { AuthService } from '../identity/application/use-cases/auth.js';
import { IdentityModule } from '../identity/identity.module.js';
import { SyncAccounts } from '../ledger/application/use-cases/sync-accounts.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CreateGoal } from '../planning/application/use-cases/goals.js';
import { CreateIncomeSource } from '../planning/application/use-cases/income.js';
import { PlanningModule } from '../planning/planning.module.js';
import { RecordMonthlyAnalysis } from '../routine/application/monthly-analysis-routine.js';
import { RoutineModule } from '../routine/routine.module.js';
import { SeedDemoInstance } from './application/seed-demo-instance.js';

/** Modo demonstração (DEMO_PASSWORD): prepara a instância vazia para quem quer experimentar o app. */
@Module({
  imports: [IdentityModule, LedgerModule, PlanningModule, CareerModule, RoutineModule],
  providers: [
    { provide: Clock, useFactory: () => new SystemClock() },
    {
      provide: SeedDemoInstance,
      useFactory: (
        auth: AuthService,
        sync: SyncAccounts,
        createSource: CreateIncomeSource,
        createGoal: CreateGoal,
        saveProfile: SaveCareerProfile,
        createOpportunity: CreateOpportunity,
        recordAnalysis: RecordMonthlyAnalysis,
        clock: Clock,
      ) =>
        new SeedDemoInstance({
          auth,
          sync,
          createSource,
          createGoal,
          saveProfile,
          createOpportunity,
          recordAnalysis,
          clock,
        }),
      inject: [
        AuthService,
        SyncAccounts,
        CreateIncomeSource,
        CreateGoal,
        SaveCareerProfile,
        CreateOpportunity,
        RecordMonthlyAnalysis,
        Clock,
      ],
    },
  ],
})
export class DemoModule implements OnApplicationBootstrap {
  private readonly logger = new Logger('Demo');
  /** Resolvida quando a preparação termina (ou não é necessária). Útil em testes. */
  ready: Promise<void> = Promise.resolve();

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ModuleRef) private readonly modules: ModuleRef,
    @Inject(SeedDemoInstance) private readonly seed: SeedDemoInstance,
  ) {}

  onApplicationBootstrap(): void {
    const demo = this.config.demo;
    if (!demo) return;
    // O ledger precisa ter preparado índices e categorias antes da primeira sincronização.
    this.ready = this.modules
      .get(LedgerModule, { strict: false })
      .ready.then(() => this.seed.execute(demo.password))
      .then((result) =>
        this.logger.log(result === 'semeada' ? 'instância de demonstração pronta' : 'demonstração já preparada'),
      )
      .catch((error: Error) => this.logger.error(`não foi possível preparar a demonstração: ${error.message}`));
  }
}
