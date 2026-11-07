import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { StubDatabaseHealth } from '../../../../test/doubles/stub-database-health.js';
import { configureApp, createFastifyAdapter } from '../../../bootstrap.js';
import { DatabaseHealth } from '../application/database-health.js';
import { HealthModule } from '../health.module.js';

async function appWith(database: DatabaseHealth): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(DatabaseHealth)
    .useValue(database)
    .compile();
  return configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
  );
}

describe('GET /health', () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => app?.close());

  it('answers 200 with status ok when the database is up', async () => {
    app = await appWith(StubDatabaseHealth.up());
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('answers 503 with status degraded when the database is down', async () => {
    app = await appWith(StubDatabaseHealth.down());
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', checks: { database: 'down' } });
  });

  it('does not expose framework details in headers', async () => {
    app = await appWith(StubDatabaseHealth.up());
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
