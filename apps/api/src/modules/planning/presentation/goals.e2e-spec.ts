import { GoalPlanSchema, GoalSchema, RequiredIncomeSchema } from '@finapp/contracts';
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

describe('goals HTTP API (demo ledger, real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;
  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: `e2e_goals_${Date.now()}`,
      OPEN_FINANCE_PROVIDER: 'demo',
      SYNC_INTERVAL_HOURS: '0',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, MongoModule, LedgerModule, PlanningModule],
    })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(new FixedClock(new Date('2026-11-07T15:00:00Z')))
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
    await app.get(LedgerModule).ready;
    expect((await call('POST', '/sync', {})).statusCode).toBe(200);
    expect(
      (
        await call('POST', '/income/sources', {
          name: 'Bolsa',
          kind: 'scholarship',
          expectedMonthlyCents: 270_000,
          startsOn: '2025-01',
          risk: 'low',
          status: 'active',
        })
      ).statusCode,
    ).toBe(201);
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('registers goals with computed costs, keeps their order and plans them on the real cost of living', async () => {
    const bike = GoalSchema.parse(
      (
        await call('POST', '/goals', {
          name: 'Bicicleta elétrica',
          kind: 'purchase',
          priceCents: 330_000,
          financing: { kind: 'interest_free', installments: 12 },
          recurringCosts: [{ name: 'manutenção', monthlyCents: 8_000, replacesCategoryId: 'transporte.app' }],
        })
      ).json(),
    );
    expect(bike.installment.cents).toBe(27_500);
    expect(bike.upfront.cents).toBe(0);
    const cnh = GoalSchema.parse(
      (
        await call('POST', '/goals', {
          name: 'CNH',
          kind: 'purchase',
          priceCents: 100_000,
          financing: { kind: 'cash' },
        })
      ).json(),
    );
    expect((await call('POST', '/goals/order', { ids: [cnh.id, bike.id] })).statusCode).toBe(204);
    expect((await call('GET', '/goals')).json().map((g: { name: string }) => g.name)).toEqual([
      'CNH',
      'Bicicleta elétrica',
    ]);

    const plan = GoalPlanSchema.parse((await call('GET', '/goals/plan?months=24&startingSavingsCents=0')).json());
    expect(plan.months[0]).toBe('2026-11');
    expect(plan.baseline.months).toBe(6);
    expect(plan.baseline.monthlySpending.cents).toBeGreaterThan(0);
    const floor = plan.scenarios.find((s) => s.id === 'floor');
    expect(floor?.goals.map((g) => g.goalId)).toEqual([cnh.id, bike.id]);
    expect(floor?.timeline).toHaveLength(24);

    const required = RequiredIncomeSchema.parse(
      (await call('GET', '/goals/required-income?months=24&startingSavingsCents=0&deadline=2027-06')).json(),
    );
    expect(required.steps.map((s) => s.goalId)).toEqual([cnh.id, bike.id]);
    // cumulativa: a segunda meta nunca exige menos renda que a primeira
    const [first, second] = required.steps.map((s) => s.monthlyIncome?.cents ?? 0);
    expect(second).toBeGreaterThanOrEqual(first ?? 0);
    expect(required.steps.every((s) => s.startMonth && s.startMonth <= '2027-06')).toBe(true);
  });

  it('rejects invalid goals and unknown ids', async () => {
    expect(
      (
        await call('POST', '/goals', {
          name: 'X',
          kind: 'purchase',
          priceCents: 100,
          financing: { kind: 'loan', installments: 0, monthlyRate: 0.01 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/goals', {
          name: 'X',
          kind: 'purchase',
          priceCents: 100,
          downPaymentCents: 500,
          financing: { kind: 'interest_free', installments: 2 },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await call('PUT', '/goals/nope', { name: 'X', kind: 'purchase', priceCents: 1, financing: { kind: 'cash' } }))
        .statusCode,
    ).toBe(404);
    expect((await call('DELETE', '/goals/nope')).statusCode).toBe(404);
  });
});
