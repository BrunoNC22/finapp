import { Inject, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Db } from 'mongodb';
import { Clock } from '../../shared/application/clock.js';
import { IdGenerator } from '../../shared/application/id-generator.js';
import { AppConfig } from '../../shared/config/app-config.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { UuidIdGenerator } from '../../shared/infrastructure/uuid-id-generator.js';
import { AccountRepository } from './application/ports/account-repository.js';
import { CategorizationRuleRepository } from './application/ports/categorization-rule-repository.js';
import { CategoryRepository } from './application/ports/category-repository.js';
import { OpenFinanceProvider } from './application/ports/open-finance-provider.js';
import { RecurrenceDismissals } from './application/ports/recurrence-dismissals.js';
import { RawPayloadStore, SyncLock, SyncRunRepository } from './application/ports/sync-ports.js';
import { TransactionQueries } from './application/ports/transaction-queries.js';
import { TransactionRepository } from './application/ports/transaction-repository.js';
import {
  CategorizeTransactionManually,
  CreateCategorizationRule,
  SeedDefaultCategorization,
} from './application/use-cases/categorization.js';
import { GetAvailableBalance, GetCostOfLiving } from './application/use-cases/cost-of-living.js';
import {
  ClassifyTransactionManually,
  CreateCategory,
  GetInstallmentPurchases,
  UpdateCategory,
} from './application/use-cases/ledger-commands.js';
import { ListIncomeEntries } from './application/use-cases/list-income-entries.js';
import { GetMonthlyReport } from './application/use-cases/monthly-report.js';
import { SyncAccounts } from './application/use-cases/sync-accounts.js';
import { Categorizer } from './domain/categorization/categorizer.js';
import { DemoOpenFinanceProvider } from './infrastructure/demo/demo-open-finance-provider.js';
import { ensureLedgerIndexes } from './infrastructure/mongo/ledger-collections.js';
import {
  MongoAccountRepository,
  MongoCategorizationRuleRepository,
  MongoCategoryRepository,
  MongoRawPayloadStore,
  MongoRecurrenceDismissals,
  MongoSyncLock,
  MongoSyncRunRepository,
} from './infrastructure/mongo/mongo-ledger-adapters.js';
import { MongoTransactionQueries } from './infrastructure/mongo/mongo-transaction-queries.js';
import { MongoTransactionRepository } from './infrastructure/mongo/mongo-transaction-repository.js';
import { PluggyClient } from './infrastructure/pluggy/pluggy-client.js';
import { PluggyOpenFinanceProvider } from './infrastructure/pluggy/pluggy-open-finance-provider.js';
import { nodeTimers, SyncScheduler } from './infrastructure/scheduling/sync-scheduler.js';
import {
  AccountsController,
  CategoriesController,
  CategorizationRulesController,
  InstallmentsController,
  TransactionsController,
} from './presentation/ledger.controllers.js';
import { ReportsController } from './presentation/reports.controller.js';
import { SyncController } from './presentation/sync.controller.js';

const mongo = <T>(provide: abstract new (...args: never[]) => T, make: (db: Db) => T) => ({
  provide,
  useFactory: make,
  inject: [Db],
});

function openFinanceProvider(config: AppConfig, clock: Clock): OpenFinanceProvider {
  switch (config.openFinance.provider) {
    case 'demo':
      return new DemoOpenFinanceProvider(clock);
    case 'pluggy': {
      const { clientId, clientSecret, itemIds } = config.openFinance;
      return new PluggyOpenFinanceProvider(new PluggyClient({ clientId, clientSecret }), itemIds);
    }
  }
}

/** Composição do livro-caixa: liga as portas aos adapters (MongoDB, provedor de Open Finance). */
@Module({
  controllers: [
    SyncController,
    AccountsController,
    TransactionsController,
    CategoriesController,
    CategorizationRulesController,
    InstallmentsController,
    ReportsController,
  ],
  providers: [
    { provide: Clock, useFactory: () => new SystemClock() },
    { provide: IdGenerator, useFactory: () => new UuidIdGenerator() },
    mongo(TransactionRepository, (db) => new MongoTransactionRepository(db)),
    mongo(AccountRepository, (db) => new MongoAccountRepository(db)),
    mongo(CategoryRepository, (db) => new MongoCategoryRepository(db)),
    mongo(CategorizationRuleRepository, (db) => new MongoCategorizationRuleRepository(db)),
    mongo(SyncRunRepository, (db) => new MongoSyncRunRepository(db)),
    mongo(SyncLock, (db) => new MongoSyncLock(db)),
    mongo(RawPayloadStore, (db) => new MongoRawPayloadStore(db)),
    mongo(TransactionQueries, (db) => new MongoTransactionQueries(db)),
    mongo(RecurrenceDismissals, (db) => new MongoRecurrenceDismissals(db)),
    {
      provide: GetMonthlyReport,
      useFactory: (t: TransactionRepository, d: RecurrenceDismissals, clock: Clock) =>
        new GetMonthlyReport(t, d, clock),
      inject: [TransactionRepository, RecurrenceDismissals, Clock],
    },
    {
      provide: CategorizeTransactionManually,
      useFactory: (
        t: TransactionRepository,
        c: CategoryRepository,
        r: CategorizationRuleRepository,
        provider: OpenFinanceProvider,
      ) => new CategorizeTransactionManually(t, c, r, new Categorizer(provider.categoryMap)),
      inject: [TransactionRepository, CategoryRepository, CategorizationRuleRepository, OpenFinanceProvider],
    },
    {
      provide: GetCostOfLiving,
      useFactory: (t: TransactionRepository) => new GetCostOfLiving(t),
      inject: [TransactionRepository],
    },
    {
      provide: GetAvailableBalance,
      useFactory: (a: AccountRepository) => new GetAvailableBalance(a),
      inject: [AccountRepository],
    },
    {
      provide: ListIncomeEntries,
      useFactory: (t: TransactionRepository) => new ListIncomeEntries(t),
      inject: [TransactionRepository],
    },
    {
      provide: ClassifyTransactionManually,
      useFactory: (t: TransactionRepository) => new ClassifyTransactionManually(t),
      inject: [TransactionRepository],
    },
    {
      provide: CreateCategory,
      useFactory: (c: CategoryRepository) => new CreateCategory(c),
      inject: [CategoryRepository],
    },
    {
      provide: UpdateCategory,
      useFactory: (c: CategoryRepository) => new UpdateCategory(c),
      inject: [CategoryRepository],
    },
    {
      provide: CreateCategorizationRule,
      useFactory: (
        rules: CategorizationRuleRepository,
        categories: CategoryRepository,
        transactions: TransactionRepository,
        provider: OpenFinanceProvider,
        ids: IdGenerator,
      ) => new CreateCategorizationRule(rules, categories, transactions, new Categorizer(provider.categoryMap), ids),
      inject: [
        CategorizationRuleRepository,
        CategoryRepository,
        TransactionRepository,
        OpenFinanceProvider,
        IdGenerator,
      ],
    },
    {
      provide: GetInstallmentPurchases,
      useFactory: (t: TransactionRepository, clock: Clock) => new GetInstallmentPurchases(t, clock),
      inject: [TransactionRepository, Clock],
    },
    { provide: OpenFinanceProvider, useFactory: openFinanceProvider, inject: [AppConfig, Clock] },
    {
      provide: SyncAccounts,
      useFactory: (
        provider: OpenFinanceProvider,
        accounts: AccountRepository,
        transactions: TransactionRepository,
        rules: CategorizationRuleRepository,
        runs: SyncRunRepository,
        lock: SyncLock,
        raw: RawPayloadStore,
        clock: Clock,
        ids: IdGenerator,
      ) => new SyncAccounts({ provider, accounts, transactions, rules, runs, lock, raw, clock, ids }),
      inject: [
        OpenFinanceProvider,
        AccountRepository,
        TransactionRepository,
        CategorizationRuleRepository,
        SyncRunRepository,
        SyncLock,
        RawPayloadStore,
        Clock,
        IdGenerator,
      ],
    },
    {
      provide: SyncScheduler,
      useFactory: (sync: SyncAccounts, runs: SyncRunRepository, clock: Clock, config: AppConfig) =>
        new SyncScheduler({
          sync,
          runs,
          clock,
          timers: nodeTimers,
          intervalHours: config.sync.intervalHours,
          log: (message) => new Logger('SyncScheduler').log(message),
        }),
      inject: [SyncAccounts, SyncRunRepository, Clock, AppConfig],
    },
    {
      provide: SeedDefaultCategorization,
      useFactory: (categories: CategoryRepository, rules: CategorizationRuleRepository) =>
        new SeedDefaultCategorization(categories, rules),
      inject: [CategoryRepository, CategorizationRuleRepository],
    },
  ],
  exports: [
    TransactionRepository,
    AccountRepository,
    CategoryRepository,
    CategorizationRuleRepository,
    ListIncomeEntries,
    GetCostOfLiving,
    GetAvailableBalance,
  ],
})
export class LedgerModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LedgerModule.name);
  private retry: NodeJS.Timeout | undefined;
  /** Resolvida quando índices e taxonomia padrão estão prontos (útil em testes). */
  readonly ready: Promise<void>;
  private markReady: () => void = () => {};

  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(SeedDefaultCategorization) private readonly seed: SeedDefaultCategorization,
    @Inject(SyncScheduler) private readonly scheduler: SyncScheduler,
  ) {
    this.ready = new Promise((resolve) => {
      this.markReady = resolve;
    });
  }

  /** Não bloqueia o boot: com o banco fora do ar, a API sobe e tenta de novo a cada 30 s. */
  onApplicationBootstrap(): void {
    void this.prepare();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.retry);
    this.scheduler.stop();
  }

  private async prepare(): Promise<void> {
    try {
      await ensureLedgerIndexes(this.db);
      const migrated = await new MongoTransactionRepository(this.db).backfillSearchFields();
      if (migrated > 0) this.logger.log(`campo de busca preenchido em ${migrated} transações`);
      const seeded = await this.seed.execute();
      this.logger.log(
        `ledger pronto (categorias criadas: ${seeded.categoriesCreated}, regras: ${seeded.rulesCreated})`,
      );
      this.markReady();
      // A sincronização automática só começa com o banco preparado.
      void this.scheduler.start();
    } catch (error) {
      this.logger.warn(
        `banco indisponível para preparar o ledger; nova tentativa em 30 s (${(error as Error).message})`,
      );
      this.retry = setTimeout(() => void this.prepare(), 30_000);
    }
  }
}
