import {
  AccountSchema,
  CategorizationRuleSchema,
  CategorySchema,
  InstallmentPurchaseSchema,
  TransactionPageSchema,
  TransactionSchema,
} from '@finapp/contracts';
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

// Documentos sintéticos usados pelo provedor demo: não podem aparecer em nenhuma resposta.
const DEMO_DOCUMENTS = ['12345678909', '12345678000195', '98765432100'];

describe('ledger HTTP API (demo provider, real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;

  const get = async (url: string) => app.inject({ method: 'GET', url });
  const send = async (method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown>) =>
    app.inject({ method, url, payload });
  const noDocuments = (body: string) => DEMO_DOCUMENTS.every((d) => !body.includes(d));

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: `e2e_ledger_${Date.now()}`,
      OPEN_FINANCE_PROVIDER: 'demo',
      SYNC_INTERVAL_HOURS: '0',
    });
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, MongoModule, LedgerModule] })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(new FixedClock(new Date('2026-11-07T15:00:00Z')))
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
    await app.get(LedgerModule).ready;
    expect((await send('POST', '/sync', {})).statusCode).toBe(200);
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('GET /accounts lists accounts in the contract format, without holder documents', async () => {
    const response = await get('/accounts');
    expect(response.statusCode).toBe(200);
    const accounts = AccountSchema.array().parse(response.json());
    expect(accounts).toHaveLength(5);
    expect(noDocuments(response.body)).toBe(true);
  });

  it('GET /transactions paginates through everything, newest first, in the contract format', async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    let lastDate = '9999-12-31';
    do {
      const response = await get(`/transactions?limit=200${cursor ? `&cursor=${cursor}` : ''}`);
      expect(response.statusCode).toBe(200);
      expect(noDocuments(response.body)).toBe(true);
      const page = TransactionPageSchema.parse(response.json());
      for (const t of page.items) {
        expect(t.occurredOn <= lastDate).toBe(true);
        lastDate = t.occurredOn;
      }
      ids.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(500);
  });

  it('filters by text ignoring accents, by category and by classification', async () => {
    const rides = TransactionPageSchema.parse((await get('/transactions?q=CORRÍDAS&limit=200')).json()).items;
    expect(rides.length).toBeGreaterThan(50);
    expect(rides.every((t) => /corridas/i.test(t.description))).toBe(true);
    expect(rides.every((t) => t.category?.id === 'transporte.app')).toBe(true);

    const transfers = TransactionPageSchema.parse(
      (await get('/transactions?classification=internal_transfer&limit=200')).json(),
    );
    expect(transfers.items.every((t) => t.classification === 'internal_transfer')).toBe(true);
  });

  it('rejects invalid queries with the field name and never echoes values', async () => {
    const response = await get('/transactions?limit=1000&from=ontem');
    expect(response.statusCode).toBe(400);
    expect(
      response
        .json()
        .problems.map((p: { field: string }) => p.field)
        .sort(),
    ).toEqual(['from', 'limit']);
    expect(response.body).not.toContain('ontem');
    expect((await get('/transactions?cursor=lixo')).statusCode).toBe(400);
  });

  it('GET /transactions/:id returns 404 for unknown ids', async () => {
    expect((await get('/transactions/nao-existe')).statusCode).toBe(404);
  });

  it('PATCH category sets a manual category; unknown categories are 404', async () => {
    const [first] = TransactionPageSchema.parse(
      // Uma compra no cartão, não uma corrida (outro teste confere que as corridas estão em Transporte).
      (await get('/transactions?classification=expense&paymentMethod=card_purchase&q=supermercado&limit=1')).json(),
    ).items;
    const response = await send('PATCH', `/transactions/${first?.id}/category`, { categoryId: 'lazer.outros' });
    expect(response.statusCode).toBe(200);
    expect(TransactionSchema.parse(response.json()).category).toEqual({ id: 'lazer.outros', source: 'manual' });
    expect((await send('PATCH', `/transactions/${first?.id}/category`, { categoryId: 'nao.existe' })).statusCode).toBe(
      404,
    );
  });

  it('PATCH classification declares a transfer and links both sides', async () => {
    const page = TransactionPageSchema.parse(
      (await get('/transactions?paymentMethod=pix&classification=expense&limit=1')).json(),
    );
    const income = TransactionPageSchema.parse((await get('/transactions?classification=income&limit=1')).json());
    const out = page.items[0];
    const into = income.items[0];
    const response = await send('PATCH', `/transactions/${out?.id}/classification`, {
      classification: 'internal_transfer',
      counterpartId: into?.id,
    });
    expect(response.statusCode).toBe(200);
    expect(TransactionSchema.parse(response.json()).transferLinkId).toBe(into?.id);
    expect(TransactionSchema.parse((await get(`/transactions/${into?.id}`)).json()).transferLinkId).toBe(out?.id);
  });

  it('POST /categorization-rules creates a rule and applies it to existing transactions', async () => {
    const response = await send('POST', '/categorization-rules', {
      name: 'Lanches são lazer',
      categoryId: 'lazer.outros',
      descriptionContains: 'lanchonete',
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    CategorizationRuleSchema.parse(body.rule);
    expect(body.affected).toBeGreaterThan(10);

    const snacks = TransactionPageSchema.parse((await get('/transactions?q=lanchonete&limit=200')).json()).items;
    expect(snacks.every((t) => t.category?.id === 'lazer.outros')).toBe(true);
    expect(CategorizationRuleSchema.array().parse((await get('/categorization-rules')).json()).length).toBe(2);
  });

  it('GET /installments shows purchases and what is still due', async () => {
    const purchases = InstallmentPurchaseSchema.array().parse((await get('/installments')).json());
    expect(purchases.length).toBeGreaterThanOrEqual(3);
    expect(purchases.some((p) => p.projected.length > 0)).toBe(true);
  });

  it('categories: list, create a subcategory, rename and archive', async () => {
    expect(CategorySchema.array().parse((await get('/categories')).json()).length).toBeGreaterThan(40);
    const created = CategorySchema.parse(
      (await send('POST', '/categories', { name: 'Moto', kind: 'expense', parentId: 'transporte' })).json(),
    );
    expect(created.id).toBe('transporte.moto');
    expect((await send('PATCH', `/categories/${created.id}`, { name: 'Moto e equipamentos' })).json().name).toBe(
      'Moto e equipamentos',
    );
    expect((await send('PATCH', `/categories/${created.id}`, { archived: true })).json().archived).toBe(true);
    expect((await send('POST', '/categories', { kind: 'expense' })).statusCode).toBe(400);
  });
});
