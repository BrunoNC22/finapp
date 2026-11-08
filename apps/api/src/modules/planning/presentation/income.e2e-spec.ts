import { IncomeOverviewSchema, IncomeSourceSchema } from '@finapp/contracts';
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
import { LedgerModule } from '../../ledger/ledger.module.js';
import { PlanningModule } from '../planning.module.js';

describe('income HTTP API (demo ledger, real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: `e2e_income_${Date.now()}`,
      OPEN_FINANCE_PROVIDER: 'demo',
      SYNC_INTERVAL_HOURS: '0',
    });
    const clock = new FixedClock(new Date('2026-11-07T15:00:00Z'));
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, MongoModule, LedgerModule, PlanningModule],
    })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
    await app.get(LedgerModule).ready;
    expect((await call('POST', '/sync', {})).statusCode).toBe(200);
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('registers a source and tracks it against what really came in (demo scholarship, 1.200/month)', async () => {
    const created = await call('POST', '/income/sources', {
      name: 'Bolsa de pesquisa',
      kind: 'scholarship',
      expectedMonthlyCents: 120_000,
      startsOn: '2025-01',
      endsOn: '2027-04',
      risk: 'low',
      status: 'active',
      matcher: { descriptionContains: 'bolsa pesquisa' },
    });
    expect(created.statusCode).toBe(201);
    const source = IncomeSourceSchema.parse(created.json());

    const overview = IncomeOverviewSchema.parse((await call('GET', '/income/overview?month=2026-10&months=12')).json());
    const tracked = overview.tracking.sources.find((s) => s.sourceId === source.id);
    expect(tracked).toMatchObject({ status: 'paid', observed: { cents: 120_000 } });
    const floor = overview.projection.scenarios.find((s) => s.id === 'floor');
    expect(overview.projection.months[0]).toBe('2026-11');
    // nov/26..abr/27 = 6 meses de 1.200; mai/27 em diante = 0
    expect(floor?.totals.map((m) => m.cents)).toEqual([...Array(6).fill(120_000), ...Array(6).fill(0)]);
  });

  it('updates, rejects invalid input, and deletes', async () => {
    const created = IncomeSourceSchema.parse(
      (
        await call('POST', '/income/sources', {
          name: 'Freela',
          kind: 'freelance',
          expectedMonthlyCents: 150_000,
          startsOn: '2025-07',
          risk: 'high',
          status: 'active',
        })
      ).json(),
    );
    const changed = await call('PATCH', `/income/sources/${created.id}`, { risk: 'medium', endsOn: '2026-12' });
    expect(IncomeSourceSchema.parse(changed.json())).toMatchObject({ risk: 'medium', endsOn: '2026-12' });
    expect((await call('PATCH', `/income/sources/${created.id}`, { endsOn: '2020-01' })).statusCode).toBe(422);
    expect((await call('POST', '/income/sources', { name: 'X' })).statusCode).toBe(400);
    expect((await call('DELETE', `/income/sources/${created.id}`)).statusCode).toBe(204);
    expect((await call('DELETE', `/income/sources/${created.id}`)).statusCode).toBe(404);
  });
});
