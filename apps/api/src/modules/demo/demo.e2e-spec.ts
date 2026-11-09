import { AuthStatusSchema } from '@finapp/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';
import { FakePasskeyService } from '../../../test/doubles/in-memory-identity.js';
import { TestMongo } from '../../../test/mongo/test-mongo.js';
import { configureApp, createFastifyAdapter } from '../../bootstrap.js';
import { Clock } from '../../shared/application/clock.js';
import { AppConfig } from '../../shared/config/app-config.js';
import { ConfigModule } from '../../shared/config/config.module.js';
import { MongoModule } from '../../shared/infrastructure/mongo/mongo.module.js';
import { OpportunityRepository } from '../career/application/career.js';
import { CareerModule } from '../career/career.module.js';
import { PasskeyService } from '../identity/application/ports/identity-ports.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AccountRepository } from '../ledger/application/ports/account-repository.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { GoalRepository } from '../planning/application/ports/goal-ports.js';
import { IncomeSourceRepository } from '../planning/application/ports/income-ports.js';
import { PlanningModule } from '../planning/planning.module.js';
import { SeedDemoInstance } from './application/seed-demo-instance.js';
import { DemoModule } from './demo.module.js';

describe('demo mode (real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: `e2e_demo_${Date.now()}`,
      OPEN_FINANCE_PROVIDER: 'demo',
      SYNC_INTERVAL_HOURS: '0',
      DEMO_PASSWORD: 'senha-do-demo',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, MongoModule, IdentityModule, LedgerModule, PlanningModule, CareerModule, DemoModule],
    })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(new FixedClock(new Date('2026-11-09T15:00:00Z')))
      .overrideProvider(PasskeyService)
      .useValue(new FakePasskeyService())
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
    await app.get(DemoModule).ready;
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('boots ready to try: tells the login screen the demo password, which works', async () => {
    const status = AuthStatusSchema.parse((await app.inject({ method: 'GET', url: '/auth/status' })).json());
    expect(status).toMatchObject({ ownerExists: true, demoPassword: 'senha-do-demo' });
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { password: 'senha-do-demo' } });
    expect(login.statusCode).toBe(200);
  });

  it('fills every screen with fictitious data: synced accounts, income, goals and career', async () => {
    expect((await app.get(AccountRepository).findAll()).length).toBeGreaterThan(0);
    expect((await app.get(IncomeSourceRepository).findAll()).length).toBeGreaterThanOrEqual(3);
    expect((await app.get(GoalRepository).findAll()).length).toBeGreaterThanOrEqual(3);
    expect((await app.get(OpportunityRepository).findAll()).length).toBeGreaterThanOrEqual(3);
    const { token } = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { password: 'senha-do-demo' } })
    ).json();
    const profile = await app.inject({
      method: 'GET',
      url: '/career/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().headline).toMatch(/fictício/);
    // Sem a skill do Claude Code no demo, o lembrete da análise não aparece.
    const reminder = await app.inject({
      method: 'GET',
      url: '/routine/analysis',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(reminder.json()).toMatchObject({ month: '2026-10', pending: false });
  });

  it('never seeds twice (a restart keeps what the visitor changed)', async () => {
    const before = (await app.get(GoalRepository).findAll()).length;
    expect(await app.get(SeedDemoInstance).execute('senha-do-demo')).toBe('ja-existia');
    expect((await app.get(GoalRepository).findAll()).length).toBe(before);
  });
});
