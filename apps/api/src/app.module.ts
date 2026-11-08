import { Module } from '@nestjs/common';
import { AssistantModule } from './modules/assistant/assistant.module.js';
import { CareerModule } from './modules/career/career.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { PlanningModule } from './modules/planning/planning.module.js';
import { ConfigModule } from './shared/config/config.module.js';
import { LoggingModule } from './shared/infrastructure/logging/logging.module.js';
import { MongoModule } from './shared/infrastructure/mongo/mongo.module.js';

/** Composition root: liga portas a adapters. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    MongoModule,
    IdentityModule,
    HealthModule,
    LedgerModule,
    PlanningModule,
    CareerModule,
    AssistantModule,
  ],
})
export class AppModule {}
