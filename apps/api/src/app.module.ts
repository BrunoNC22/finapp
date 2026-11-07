import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { ConfigModule } from './shared/config/config.module.js';
import { LoggingModule } from './shared/infrastructure/logging/logging.module.js';
import { MongoModule } from './shared/infrastructure/mongo/mongo.module.js';

/** Composition root: liga portas a adapters. */
@Module({
  imports: [ConfigModule, LoggingModule, MongoModule, HealthModule, LedgerModule],
})
export class AppModule {}
