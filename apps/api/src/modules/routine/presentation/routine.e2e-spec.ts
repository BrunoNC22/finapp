import { AnalysisReminderSchema } from '@finapp/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../../../../test/doubles/fixed-clock.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { configureApp, createFastifyAdapter } from '../../../bootstrap.js';
import { Clock } from '../../../shared/application/clock.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { ConfigModule } from '../../../shared/config/config.module.js';
import { MongoModule } from '../../../shared/infrastructure/mongo/mongo.module.js';
import { RoutineModule } from '../routine.module.js';

describe('monthly routine HTTP API (real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: `e2e_routine_${Date.now()}`,
      OPEN_FINANCE_PROVIDER: 'demo',
    });
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, MongoModule, RoutineModule] })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(new FixedClock(new Date('2026-11-09T15:00:00Z')))
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('reminds about October until it is done or skipped; rejects the current month and bad outcomes', async () => {
    const before = AnalysisReminderSchema.parse((await app.inject({ method: 'GET', url: '/routine/analysis' })).json());
    expect(before).toEqual({ month: '2026-10', pending: true });

    const bad = await app.inject({ method: 'POST', url: '/routine/analysis/2026-10', payload: { outcome: 'talvez' } });
    expect(bad.statusCode).toBe(400);
    const current = await app.inject({
      method: 'POST',
      url: '/routine/analysis/2026-11',
      payload: { outcome: 'feita' },
    });
    expect(current.statusCode).toBe(422);

    const skipped = await app.inject({
      method: 'POST',
      url: '/routine/analysis/2026-10',
      payload: { outcome: 'pulada' },
    });
    expect(skipped.statusCode).toBe(200);
    expect(AnalysisReminderSchema.parse(skipped.json())).toEqual({
      month: '2026-10',
      pending: false,
      outcome: 'pulada',
      recordedAt: '2026-11-09T15:00:00.000Z',
    });
  });
});
