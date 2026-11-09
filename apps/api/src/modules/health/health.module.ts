import { Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Db } from 'mongodb';
import { CheckHealth } from './application/check-health.js';
import { DatabaseHealth } from './application/database-health.js';
import { LedgerConsentCheck } from './infrastructure/ledger-consent-check.js';
import { MongoDatabaseHealth } from './infrastructure/mongo-database-health.js';
import { HealthController } from './presentation/health.controller.js';

/**
 * Composição do módulo de health. Casos de uso e adapters não têm decorators do Nest:
 * são registrados aqui por fábrica. O `Db` vem do módulo global de MongoDB.
 */
@Module({
  controllers: [HealthController],
  providers: [
    { provide: DatabaseHealth, useFactory: (db: Db) => new MongoDatabaseHealth(db), inject: [Db] },
    {
      provide: CheckHealth,
      useFactory: (database: DatabaseHealth, modules: ModuleRef) =>
        new CheckHealth(database, { timeoutMs: 2000 }, new LedgerConsentCheck(modules)),
      inject: [DatabaseHealth, ModuleRef],
    },
  ],
})
export class HealthModule {}
