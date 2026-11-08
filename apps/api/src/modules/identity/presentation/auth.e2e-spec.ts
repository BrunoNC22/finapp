import { LoginResultSchema, SessionSchema } from '@finapp/contracts';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../../../../test/doubles/fixed-clock.js';
import { FakePasskeyService } from '../../../../test/doubles/in-memory-identity.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { configureApp, createFastifyAdapter } from '../../../bootstrap.js';
import { Clock } from '../../../shared/application/clock.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { ConfigModule } from '../../../shared/config/config.module.js';
import { MongoModule } from '../../../shared/infrastructure/mongo/mongo.module.js';
import { IS_PUBLIC } from '../../../shared/presentation/public.decorator.js';
import { CareerModule } from '../../career/career.module.js';
import { HealthModule } from '../../health/health.module.js';
import { LedgerModule } from '../../ledger/ledger.module.js';
import { PlanningModule } from '../../planning/planning.module.js';
import { PasskeyService, PasswordHasher } from '../application/ports/identity-ports.js';
import { AuthService } from '../application/use-cases/auth.js';
import { IdentityModule } from '../identity.module.js';
import { ScryptPasswordHasher } from '../infrastructure/identity-adapters.js';

const PASSWORD = 'senha-forte-1';
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

describe('authentication (bank-app style)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;
  const clock = new FixedClock(new Date('2026-11-07T15:00:00Z'));
  let firstSetupToken = '';

  const call = (method: string, url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({
      method: method as 'GET',
      url,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
      ...(payload ? { payload } : {}),
    });
  const login = async (password = PASSWORD) =>
    LoginResultSchema.parse((await call('POST', '/auth/login', undefined, { password })).json()).token;

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: `e2e_auth_${Date.now()}`,
      OPEN_FINANCE_PROVIDER: 'demo',
      SYNC_INTERVAL_HOURS: '0',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        DiscoveryModule,
        ConfigModule,
        MongoModule,
        IdentityModule,
        HealthModule,
        LedgerModule,
        PlanningModule,
        CareerModule,
      ],
    })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(PasskeyService)
      .useValue(new FakePasskeyService())
      // scrypt mais leve só para o teste ser rápido
      .overrideProvider(PasswordHasher)
      .useValue(new ScryptPasswordHasher({ N: 2 ** 10, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }))
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
    await app.get(LedgerModule).ready;

    // Primeiro acesso (todos os testes partem de uma instância configurada; a ordem é aleatória).
    expect((await call('GET', '/auth/status')).json()).toEqual({ ownerExists: false, passkeys: 0 });
    firstSetupToken = (await app.get(AuthService).issueSetupToken()).token;
    const response = await call('POST', '/auth/setup', undefined, { setupToken: firstSetupToken, password: PASSWORD });
    expect(response.statusCode).toBe(200);
    expect(LoginResultSchema.parse(response.json()).expiresAfterIdleMinutes).toBe(10);
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('every route not explicitly public answers 401 without a session (sweep of all registered routes)', async () => {
    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);
    const protectedRoutes: string[] = [];
    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
      for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        const handler = (instance as Record<string, unknown>)[name] as object;
        const path = Reflect.getMetadata(PATH_METADATA, handler);
        if (path === undefined) continue;
        if (reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler as never, metatype])) continue;
        const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number] ?? 'GET';
        const url = `/${[base, String(path)].filter(Boolean).join('/')}`
          .replace(/\/+/g, '/')
          .replace(/:[^/]+/g, 'x')
          .replace(/(.)\/$/, '$1');
        protectedRoutes.push(`${method} ${url}`);
      }
    }
    expect(protectedRoutes.length).toBeGreaterThan(15);
    for (const route of protectedRoutes) {
      const [method, url] = route.split(' ') as [string, string];
      expect((await call(method, url, undefined, {})).statusCode, route).toBe(401);
      expect((await call(method, url, 'token-invalido', {})).statusCode, route).toBe(401);
    }
    expect((await call('GET', '/health')).statusCode).not.toBe(401);
  });

  it('after the first access, the token works and the one-time code cannot be reused', async () => {
    expect((await call('GET', '/auth/status')).json().ownerExists).toBe(true);
    expect((await call('GET', '/accounts', await login())).statusCode).toBe(200);
    expect(
      (await call('POST', '/auth/setup', undefined, { setupToken: firstSetupToken, password: PASSWORD })).statusCode,
    ).toBe(401);
  });

  it('closes the session after 10 minutes of inactivity, like a bank app', async () => {
    const token = await login();
    clock.advanceMinutes(9);
    expect((await call('GET', '/accounts', token)).statusCode).toBe(200);
    clock.advanceMinutes(10);
    expect((await call('GET', '/accounts', token)).statusCode).toBe(401);
  });

  it('logout ends the session; sessions can be listed and revoked', async () => {
    const a = await login();
    const b = await login();
    const sessions = SessionSchema.array().parse((await call('GET', '/auth/sessions', a)).json());
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    const other = sessions.find((s) => !s.current);
    expect((await call('DELETE', `/auth/sessions/${other?.id}`, a)).statusCode).toBe(204);
    expect((await call('POST', '/auth/logout', a)).statusCode).toBe(204);
    expect((await call('GET', '/accounts', a)).statusCode).toBe(401);
    // b pode ter sido a revogada; em qualquer caso, nada sobra de a
    void b;
  });

  it('fingerprint: registered while logged in, then used to log in without the password', async () => {
    const token = await login();
    expect((await call('POST', '/auth/passkey/register/options', token)).statusCode).toBe(200);
    const registered = await call('POST', '/auth/passkey/register', token, {
      response: { credentialId: 'celular', signedChallenge: 'reg-challenge' },
      label: 'Celular',
    });
    expect(registered.statusCode).toBe(201);

    expect((await call('POST', '/auth/passkey/login/options')).statusCode).toBe(200);
    const viaPasskey = await call('POST', '/auth/passkey/login', undefined, {
      response: { credentialId: 'celular', signedChallenge: 'auth-challenge', counter: 1 },
    });
    expect(viaPasskey.statusCode).toBe(200);
    expect((await call('GET', '/accounts', LoginResultSchema.parse(viaPasskey.json()).token)).statusCode).toBe(200);
    expect((await call('GET', '/auth/status')).json().passkeys).toBe(1);
  });

  it('5 wrong passwords lock the login (429 with retry time) and messages never say what was wrong', async () => {
    for (let i = 0; i < 4; i++) {
      const wrong = await call('POST', '/auth/login', undefined, { password: 'errada-errada' });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json()).toEqual({ message: 'não autorizado' });
    }
    const locked = await call('POST', '/auth/login', undefined, { password: 'errada-errada' });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().retryAfterSeconds).toBe(900);
    expect((await call('POST', '/auth/login', undefined, { password: PASSWORD })).statusCode).toBe(429);
    clock.advanceMinutes(15);
    expect((await call('POST', '/auth/login', undefined, { password: PASSWORD })).statusCode).toBe(200);
  });
});
