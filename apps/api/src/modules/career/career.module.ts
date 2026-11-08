import { Module } from '@nestjs/common';
import { Db } from 'mongodb';
import { Clock } from '../../shared/application/clock.js';
import { IdGenerator } from '../../shared/application/id-generator.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { UuidIdGenerator } from '../../shared/infrastructure/uuid-id-generator.js';
import {
  CareerProfileRepository,
  CreateOpportunity,
  DeleteOpportunity,
  OpportunityRepository,
  SaveCareerProfile,
  UpdateOpportunity,
} from './application/career.js';
import { MongoCareerProfileRepository, MongoOpportunityRepository } from './infrastructure/career-adapters.js';
import { CareerController } from './presentation/career.controller.js';

/** Carreira: perfil profissional e oportunidades de renda (alimenta o assistente). */
@Module({
  controllers: [CareerController],
  providers: [
    { provide: Clock, useFactory: () => new SystemClock() },
    { provide: IdGenerator, useFactory: () => new UuidIdGenerator() },
    { provide: CareerProfileRepository, useFactory: (db: Db) => new MongoCareerProfileRepository(db), inject: [Db] },
    { provide: OpportunityRepository, useFactory: (db: Db) => new MongoOpportunityRepository(db), inject: [Db] },
    {
      provide: SaveCareerProfile,
      useFactory: (r: CareerProfileRepository) => new SaveCareerProfile(r),
      inject: [CareerProfileRepository],
    },
    {
      provide: CreateOpportunity,
      useFactory: (r: OpportunityRepository, ids: IdGenerator, c: Clock) => new CreateOpportunity(r, ids, c),
      inject: [OpportunityRepository, IdGenerator, Clock],
    },
    {
      provide: UpdateOpportunity,
      useFactory: (r: OpportunityRepository, c: Clock) => new UpdateOpportunity(r, c),
      inject: [OpportunityRepository, Clock],
    },
    {
      provide: DeleteOpportunity,
      useFactory: (r: OpportunityRepository) => new DeleteOpportunity(r),
      inject: [OpportunityRepository],
    },
  ],
  exports: [CareerProfileRepository, OpportunityRepository],
})
export class CareerModule {}
