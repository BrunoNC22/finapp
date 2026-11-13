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
import { CareerModule } from '../../career/career.module.js';
import { PasskeyService } from '../../identity/application/ports/identity-ports.js';
import { AuthService } from '../../identity/application/use-cases/auth.js';
import { McpAccess } from '../../identity/application/use-cases/mcp-access.js';
import { IdentityModule } from '../../identity/identity.module.js';
import { SyncAccounts } from '../../ledger/application/use-cases/sync-accounts.js';
import { LedgerModule } from '../../ledger/ledger.module.js';
import { CreateGoal } from '../../planning/application/use-cases/goals.js';
import { CreateIncomeSource } from '../../planning/application/use-cases/income.js';
import { PlanningModule } from '../../planning/planning.module.js';
import { RoutineModule } from '../../routine/routine.module.js';
import { McpAuditLog } from '../application/mcp-audit-log.js';
import { AssistantModule } from '../assistant.module.js';

const READ_TOOLS = [
  'analise_mensal',
  'compromissos_futuros',
  'conexoes_open_finance',
  'gastos_por_categoria',
  'listar_categorias',
  'listar_regras',
  'listar_transacoes',
  'metas_e_viabilidade',
  'oportunidades',
  'perfil_profissional',
  'previa_regra',
  'recorrencias',
  'renda_e_cenarios',
  'resumo_do_mes',
];
const WRITE_TOOLS = [
  'categorizar_transacao',
  'classificar_transacao',
  'criar_categoria',
  'criar_fonte_renda',
  'criar_meta',
  'criar_oportunidade',
  'criar_regra',
  'dispensar_recorrencia',
  'editar_categoria',
  'editar_fonte_renda',
  'editar_meta',
  'editar_oportunidade',
  'editar_perfil',
  'editar_regra',
  'excluir_fonte_renda',
  'excluir_meta',
  'excluir_oportunidade',
  'excluir_regra',
  'mesclar_categoria',
  'registrar_analise_mensal',
  'reordenar_metas',
  'sincronizar_agora',
];

// Documentos sintéticos do provedor demo: nunca podem sair pelo MCP.
const DEMO_DOCUMENTS = ['12345678909', '12345678000195', '98765432100'];

describe('MCP over HTTP (demo ledger, real MongoDB)', () => {
  let mongo: TestMongo;
  let app: NestFastifyApplication;
  let token = '';
  let writeToken = '';
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
  const tool = async (name: string, args: Record<string, unknown> = {}, auth: string = token) => {
    const response = await rpc('tools/call', { name, arguments: args }, auth);
    expect(response.statusCode).toBe(200);
    expect(DEMO_DOCUMENTS.some((d) => response.body.includes(d))).toBe(false);
    const result = response.json().result;
    expect(result.isError, `${name}: ${result.content?.[0]?.text}`).toBeFalsy();
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
      imports: [
        ConfigModule,
        MongoModule,
        IdentityModule,
        LedgerModule,
        PlanningModule,
        CareerModule,
        RoutineModule,
        AssistantModule,
      ],
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
    writeToken = await app.get(McpAccess).issue('e2e escrita', 'escrita');
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

  it('initializes and lists only the read tools for a read token', async () => {
    const init = await rpc('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1.0.0' },
    });
    expect(init.statusCode).toBe(200);
    expect(init.json().result.serverInfo.name).toBe('finapp');
    const list = await rpc('tools/list', {});
    expect(
      list
        .json()
        .result.tools.map((t: { name: string }) => t.name)
        .sort(),
    ).toEqual(READ_TOOLS);
  });

  it('lists every write tool, declared by the modules, for a write token', async () => {
    const list = await rpc('tools/list', {}, writeToken);
    const names = list
      .json()
      .result.tools.map((t: { name: string }) => t.name)
      .sort();
    expect(names).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
  });

  it('refuses a write tool called with a read token, changing nothing', async () => {
    const response = await rpc('tools/call', { name: 'criar_categoria', arguments: { name: 'X', kind: 'expense' } });
    expect(response.json().result.isError).toBe(true);
    const categories = await tool('listar_categorias');
    expect(categories.some((c: { name: string }) => c.name === 'X')).toBe(false);
  });

  it('changes data through the same use cases as the app, and audits every write', async () => {
    // livro-caixa: categoria nova, transação recategorizada pela mesma regra de aprendizado da tela
    const created = await tool('criar_categoria', { name: 'Ferramentas de IA', kind: 'expense' }, writeToken);
    const [first] = (await tool('listar_transacoes', { tipo: 'gasto', limite: 1 })).transacoes;
    const categorized = await tool(
      'categorizar_transacao',
      { transactionId: first.id, categoryId: created.id },
      writeToken,
    );
    expect(categorized.category).toMatchObject({ id: created.id, source: 'manual' });

    // planejamento: meta em centavos, reordenada para o topo; fonte de renda aprovada
    const goal = await tool(
      'criar_meta',
      {
        name: 'CNH categoria A',
        kind: 'purchase',
        priceCents: 110_000,
        financing: { kind: 'cash' },
      },
      writeToken,
    );
    expect(goal.price.cents).toBe(110_000);
    const plan = await tool('metas_e_viabilidade');
    await tool('reordenar_metas', { ids: [goal.id, plan.metas[0].id] }, writeToken);
    expect((await tool('metas_e_viabilidade')).metas.map((m: { nome: string }) => m.nome)).toEqual([
      'CNH categoria A',
      'Bicicleta elétrica',
    ]);
    const source = (await tool('renda_e_cenarios', { meses: 6 })).fontes[0];
    expect((await tool('editar_fonte_renda', { id: source.id, risk: 'medium' }, writeToken)).risk).toBe('medium');

    // carreira: perfil parcial (o resto fica), oportunidade e mudança de status
    const fullProfile = {
      headline: 'Dev júnior',
      summary: 'Resumo',
      location: 'Cidade Exemplo',
      preferences: { workModes: ['freela'], remote: true, inPerson: false },
      english: { reading: 'avancado', listening: 'intermediario', writing: 'avancado', speaking: 'basico' },
      skills: [{ name: 'TypeScript', level: 'avancado' }],
      experiences: [],
      education: [],
      links: [],
      resumeMarkdown: '',
    };
    await tool('editar_perfil', fullProfile, writeToken);
    await tool('editar_perfil', { headline: 'Dev full stack' }, writeToken);
    expect(await tool('perfil_profissional')).toMatchObject({
      titulo: 'Dev full stack',
      local: 'Cidade Exemplo',
    });
    const opportunity = await tool(
      'criar_oportunidade',
      { title: 'Agente de WhatsApp', kind: 'recorrente', estimatedMonthlyCents: 80_000 },
      writeToken,
    );
    await tool('editar_oportunidade', { id: opportunity.id, status: 'conversa' }, writeToken);
    expect((await tool('oportunidades')).oportunidades[0]).toMatchObject({ status: 'conversa', por_mes: 800 });

    // rotina: análise do mês fechado
    expect(await tool('registrar_analise_mensal', { mes: '2026-10' }, writeToken)).toMatchObject({
      mes: '2026-10',
      resultado: 'feita',
      lembrete_pendente: false,
    });

    // devolve o estado compartilhado (os testes rodam em ordem aleatória sobre o mesmo banco)
    await tool('excluir_meta', { id: goal.id }, writeToken);
    await tool('editar_fonte_renda', { id: source.id, risk: 'low' }, writeToken);

    const audited = await app.get(McpAuditLog).recent(12); // as 12 escritas deste teste
    expect(audited.every((e) => e.token === 'e2e escrita' && e.outcome === 'ok')).toBe(true);
    expect(audited.map((e) => e.tool).reverse()).toEqual([
      'criar_categoria',
      'categorizar_transacao',
      'criar_meta',
      'reordenar_metas',
      'editar_fonte_renda',
      'editar_perfil',
      'editar_perfil',
      'criar_oportunidade',
      'editar_oportunidade',
      'registrar_analise_mensal',
      'excluir_meta',
      'editar_fonte_renda',
    ]);
  });

  it('answers rule violations as tool errors (and audits them)', async () => {
    const rules = await tool('listar_regras');
    const factoryRule = rules.find((r: { id: string }) => r.id.startsWith('default-rule-'));
    const response = await rpc('tools/call', { name: 'excluir_regra', arguments: { id: factoryRule.id } }, writeToken);
    const result = response.json().result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toBe('erro interno');
    const [last] = await app.get(McpAuditLog).recent(1);
    expect(last).toMatchObject({ tool: 'excluir_regra', outcome: 'erro' });
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

    const connections = await tool('conexoes_open_finance');
    expect(connections.pior_alerta).toBe('ok');
    expect(connections.conexoes[0]).toMatchObject({ situacao: 'active', alerta: 'ok' });

    for (const name of ['gastos_por_categoria', 'compromissos_futuros', 'recorrencias', 'oportunidades'])
      await tool(name);
    await tool('perfil_profissional');

    const pack = await tool('analise_mensal', { mes: '2026-10' });
    expect(pack).toMatchObject({ mes: '2026-10', mes_anterior: '2026-09', resumo: { mes: '2026-10' } });
    expect(pack.gastos_do_mes.transacoes.length).toBeGreaterThan(0);
  });

  it('GET and DELETE are not part of a stateless server', async () => {
    expect((await app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(405);
  });
});
