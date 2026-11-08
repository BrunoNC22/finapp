import { CareerProfileSchema, OpportunitySchema } from '@finapp/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_PROFILE } from '../../../../test/contracts/career-repositories.contract.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { configureApp, createFastifyAdapter } from '../../../bootstrap.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { ConfigModule } from '../../../shared/config/config.module.js';
import { MongoModule } from '../../../shared/infrastructure/mongo/mongo.module.js';
import { CareerModule } from '../career.module.js';

describe('career HTTP API (real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;
  const call = (method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, ...(payload ? { payload: payload as Record<string, unknown> } : {}) });

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: `e2e_career_${Date.now()}`,
      OPEN_FINANCE_PROVIDER: 'demo',
    });
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, MongoModule, CareerModule] })
      .overrideProvider(AppConfig)
      .useValue(config)
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('profile: 404 until filled, then saved and read back; invalid input is rejected', async () => {
    expect((await call('GET', '/career/profile')).statusCode).toBe(404);
    expect((await call('PUT', '/career/profile', SAMPLE_PROFILE)).statusCode).toBe(200);
    expect(CareerProfileSchema.parse((await call('GET', '/career/profile')).json()).headline).toBe(
      'Desenvolvedora Full Stack',
    );
    expect(
      (await call('PUT', '/career/profile', { ...SAMPLE_PROFILE, links: [{ label: 'x', url: 'nada' }] })).statusCode,
    ).toBe(400);
    expect(
      (
        await call('PUT', '/career/profile', {
          ...SAMPLE_PROFILE,
          education: [{ title: 'X', institution: 'Y', start: '2027-01', end: '2026-01' }],
        })
      ).statusCode,
    ).toBe(422);
  });

  it('opportunities: create, move, clear the estimate, delete', async () => {
    const created = OpportunitySchema.parse(
      (
        await call('POST', '/career/opportunities', {
          title: 'Sites para negócios locais',
          kind: 'freela',
          estimatedOneOffCents: 200_000,
        })
      ).json(),
    );
    expect(created.status).toBe('ideia');
    const moved = OpportunitySchema.parse(
      (
        await call('PATCH', `/career/opportunities/${created.id}`, { status: 'aplicada', estimatedOneOffCents: null })
      ).json(),
    );
    expect(moved.status).toBe('aplicada');
    expect(moved.estimatedOneOff).toBeUndefined();
    expect((await call('GET', '/career/opportunities')).json()).toHaveLength(1);
    expect((await call('DELETE', `/career/opportunities/${created.id}`)).statusCode).toBe(204);
    expect((await call('DELETE', `/career/opportunities/${created.id}`)).statusCode).toBe(404);
  });
});
