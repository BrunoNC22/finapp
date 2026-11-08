import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
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
import { Money } from '../../../shared/kernel/money.js';
import { YearMonth } from '../../../shared/kernel/year-month.js';
import { PasskeyService } from '../../identity/application/ports/identity-ports.js';
import { AuthService } from '../../identity/application/use-cases/auth.js';
import { McpAccess } from '../../identity/application/use-cases/mcp-access.js';
import { IdentityModule } from '../../identity/identity.module.js';
import { SyncAccounts } from '../../ledger/application/use-cases/sync-accounts.js';
import { LedgerModule } from '../../ledger/ledger.module.js';
import { CreateGoal } from '../../planning/application/use-cases/goals.js';
import { CreateIncomeSource } from '../../planning/application/use-cases/income.js';
import { PlanningModule } from '../../planning/planning.module.js';
import { AssistantModule } from '../assistant.module.js';

// Documentos sintéticos do provedor demo: nunca podem sair pelo MCP.
const DEMO_DOCUMENTS = ['12345678909', '12345678000195', '98765432100'];

describe('MCP over HTTP (demo ledger, real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;
  let token = '';
  let id = 0;
  // `null` = sem token (undefined acionaria o valor padrão, o token válido)
  const rpc = (method: string, params: Record<string, unknown>, auth: string | null = token) =>
    app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      payload: { jsonrpc: '2.0', id: ++id, method, params },
    });
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await rpc('tools/call', { name, arguments: args });
    expect(response.statusCode).toBe(200);
    expect(DEMO_DOCUMENTS.some((d) => response.body.includes(d))).toBe(false);
    const result = response.json().result;
    expect(result.isError).toBeFalsy();
    return JSON.parse(result.content[0].text);
  };

  beforeAll(async () => {
    mongo = await TestMongo.start();
    const config = AppConfig.fromEnv({
      MONGO_URL: mongo.url,
      MONGO_DB_NAME: `e2e_mcp_${Date.now()}`,
      OPEN_FINANCE_PROVIDER: 'demo',
      SYNC_INTERVAL_HOURS: '0',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, MongoModule, IdentityModule, LedgerModule, PlanningModule, AssistantModule],
    })
      .overrideProvider(AppConfig)
      .useValue(config)
      .overrideProvider(Clock)
      .useValue(new FixedClock(new Date('2026-11-07T15:00:00Z')))
      .overrideProvider(PasskeyService)
      .useValue(new FakePasskeyService())
      .compile();
    app = await configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false }),
    );
    await app.get(LedgerModule).ready;
    await app.get(SyncAccounts).execute();
    await app.get(CreateIncomeSource).execute({
      name: 'Bolsa de pesquisa',
      kind: 'scholarship',
      expectedMonthly: Money.fromReais(2700),
      startsOn: YearMonth.parse('2025-01'),
      risk: 'low',
      status: 'active',
      matcher: { descriptionContains: 'bolsa pesquisa' },
    });
    await app.get(CreateGoal).execute({
      name: 'Bicicleta elétrica',
      kind: 'purchase',
      price: Money.fromReais(3300),
      downPayment: Money.zero(),
      oneTimeCosts: Money.zero(),
      financing: { kind: 'interest_free', installments: 12 },
      recurringCosts: [],
    });
    token = await app.get(McpAccess).issue('e2e');
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('only answers with a valid MCP read token (a login session token is not enough)', async () => {
    expect((await rpc('tools/list', {}, null)).statusCode).toBe(401);
    expect((await rpc('tools/list', {}, 'token-invalido')).statusCode).toBe(401);
    const setup = await app.get(AuthService).issueSetupToken();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { setupToken: setup.token, password: 'senha-forte-1' },
    });
    const sessionToken: string = login.json().token;
    expect(sessionToken).toBeTruthy();
    expect((await rpc('tools/list', {}, sessionToken)).statusCode).toBe(401);
  });

  it('initializes and lists the read-only tools', async () => {
    const init = await rpc('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1.0.0' },
    });
    expect(init.statusCode).toBe(200);
    expect(init.json().result.serverInfo.name).toBe('finapp');
    const list = await rpc('tools/list', {});
    expect(list.json().result.tools).toHaveLength(7);
  });

  it('answers with the real data, in reais, without documents', async () => {
    const month = await tool('resumo_do_mes', { mes: '2026-10' });
    expect(month.mes).toBe('2026-10');
    expect(month.entrou).toBeGreaterThan(2700);
    expect(month.maiores_categorias.length).toBeGreaterThan(0);

    const transactions = await tool('listar_transacoes', { tipo: 'gasto', limite: 5 });
    expect(transactions.transacoes).toHaveLength(5);
    expect(transactions.transacoes.every((t: { valor: number }) => t.valor <= 0)).toBe(true);

    const goals = await tool('metas_e_viabilidade');
    expect(goals.metas[0]).toMatchObject({ nome: 'Bicicleta elétrica', parcelas: 12, valor_da_parcela: 275 });
    expect(Object.keys(goals.metas[0].por_cenario).sort()).toEqual(['otimista', 'piso', 'provavel']);

    const income = await tool('renda_e_cenarios', { meses: 6 });
    expect(income.fontes[0]).toMatchObject({ nome: 'Bolsa de pesquisa', risco: 'low' });
    expect(income.projecao[0].meses).toHaveLength(6);

    for (const name of ['gastos_por_categoria', 'compromissos_futuros', 'recorrencias']) await tool(name);
  });

  it('GET and DELETE are not part of a stateless server', async () => {
    expect((await app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(405);
  });
});
