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
import { LedgerModule } from '../ledger.module.js';

describe('sync endpoints (demo provider, real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;
  const clock = new FixedClock(new Date('2026-11-07T15:00:00Z'));

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: 'e2e_sync',
      OPEN_FINANCE_PROVIDER: 'demo',
    });
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, MongoModule, LedgerModule] })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
    await app.get(LedgerModule).ready;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('seeds the default taxonomy on startup', async () => {
    expect(await mongo.client.db('e2e_sync').collection('categories').countDocuments()).toBeGreaterThan(40);
  });

  it('POST /sync imports, reconciles and returns a summary without transaction data', async () => {
    const response = await app.inject({ method: 'POST', url: '/sync' });

    expect(response.statusCode).toBe(200);
    const run = response.json();
    expect(run.status).toBe('success');
    expect(run.transferPairs).toBeGreaterThan(30);
    expect(JSON.stringify(run)).not.toMatch(/description|amount/i);
  });

  it('GET /sync/runs lists the history, most recent first, and a repeated sync creates nothing', async () => {
    clock.advanceMinutes(5);
    await app.inject({ method: 'POST', url: '/sync' });
    clock.advanceMinutes(5);
    await app.inject({ method: 'POST', url: '/sync' });

    const response = await app.inject({ method: 'GET', url: '/sync/runs?limit=50' });

    expect(response.statusCode).toBe(200);
    const runs = response.json();
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const startedAt = runs.map((r: { startedAt: string }) => r.startedAt);
    expect([...startedAt].sort().reverse()).toEqual(startedAt);
    expect(runs[0].accounts.every((a: { created: number }) => a.created === 0)).toBe(true);
  });
});
