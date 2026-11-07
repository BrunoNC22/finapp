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
import { RawPayloadStore, SyncLock, SyncRunRepository } from './application/ports/sync-ports.js';
import { TransactionRepository } from './application/ports/transaction-repository.js';
import { SeedDefaultCategorization } from './application/use-cases/categorization.js';
import { SyncAccounts } from './application/use-cases/sync-accounts.js';
import { DemoOpenFinanceProvider } from './infrastructure/demo/demo-open-finance-provider.js';
import { ensureLedgerIndexes } from './infrastructure/mongo/ledger-collections.js';
import {
  MongoAccountRepository,
  MongoCategorizationRuleRepository,
  MongoCategoryRepository,
  MongoRawPayloadStore,
  MongoSyncLock,
  MongoSyncRunRepository,
} from './infrastructure/mongo/mongo-ledger-adapters.js';
import { MongoTransactionRepository } from './infrastructure/mongo/mongo-transaction-repository.js';
import { PluggyClient } from './infrastructure/pluggy/pluggy-client.js';
import { PluggyOpenFinanceProvider } from './infrastructure/pluggy/pluggy-open-finance-provider.js';
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
  controllers: [SyncController],
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
      provide: SeedDefaultCategorization,
      useFactory: (categories: CategoryRepository, rules: CategorizationRuleRepository) =>
        new SeedDefaultCategorization(categories, rules),
      inject: [CategoryRepository, CategorizationRuleRepository],
    },
  ],
  exports: [TransactionRepository, AccountRepository, CategoryRepository, CategorizationRuleRepository],
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
  }

  private async prepare(): Promise<void> {
    try {
      await ensureLedgerIndexes(this.db);
      const seeded = await this.seed.execute();
      this.logger.log(
        `ledger pronto (categorias criadas: ${seeded.categoriesCreated}, regras: ${seeded.rulesCreated})`,
      );
      this.markReady();
    } catch (error) {
      this.logger.warn(
        `banco indisponível para preparar o ledger; nova tentativa em 30 s (${(error as Error).message})`,
      );
      this.retry = setTimeout(() => void this.prepare(), 30_000);
    }
  }
}
