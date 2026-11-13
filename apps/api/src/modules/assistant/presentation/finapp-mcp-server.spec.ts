import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FakeAssistantData } from '../../../../test/doubles/fake-assistant-data.js';
import { InMemoryMcpAuditLog } from '../../../../test/doubles/in-memory-mcp-audit-log.js';
import { NotFoundError } from '../../../shared/application/errors.js';
import { type McpTool, mcpTool } from '../../../shared/presentation/mcp-tools.js';
import type { McpGrant } from '../../identity/application/ports/identity-ports.js';
import { createFinappMcpServer, type FinappMcpOptions, MAX_TRANSACTIONS } from './finapp-mcp-server.js';

async function connected(options: FinappMcpOptions = {}) {
  const data = new FakeAssistantData();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createFinappMcpServer(data, options).connect(serverSide);
  const client = new Client({ name: 'teste', version: '1.0.0' });
  await client.connect(clientSide);
  return { data, client };
}
const text = (r: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse((r.content as { text: string }[])[0]?.text ?? '{}');

describe('finapp MCP server', () => {
  it('exposes only read-only tools, described in Portuguese, with the conventions in the instructions', async () => {
    const { client } = await connected();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'analise_mensal',
      'compromissos_futuros',
      'conexoes_open_finance',
      'gastos_por_categoria',
      'listar_transacoes',
      'metas_e_viabilidade',
      'oportunidades',
      'perfil_profissional',
      'recorrencias',
      'renda_e_cenarios',
      'resumo_do_mes',
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false)).toBe(
      true,
    );
    expect(client.getInstructions()).toMatch(/SOMENTE LEITURA/);
    expect(client.getInstructions()).toMatch(/devoluções .* nunca contam como renda/);
  });

  it('calls the port with the validated arguments and defaults', async () => {
    const { client, data } = await connected();
    expect(text(await client.callTool({ name: 'resumo_do_mes', arguments: { mes: '2026-10' } }))).toMatchObject({
      ferramenta: 'monthSummary',
      args: ['2026-10'],
    });
    await client.callTool({ name: 'gastos_por_categoria', arguments: {} });
    await client.callTool({ name: 'listar_transacoes', arguments: { busca: 'mercado' } });
    await client.callTool({ name: 'metas_e_viabilidade', arguments: { prazo: '2028-12' } });
    await client.callTool({ name: 'oportunidades', arguments: {} });
    expect(data.calls).toEqual([
      ['monthSummary', '2026-10'],
      ['spendingByCategory', undefined, 'categoria'],
      ['transactions', { busca: 'mercado', limite: 30 }],
      ['goals', '2028-12'],
      ['opportunities', true],
    ]);
  });

  it(`never lists more than ${MAX_TRANSACTIONS} transactions and rejects malformed months`, async () => {
    const { client, data } = await connected();
    const tooMany = await client.callTool({ name: 'listar_transacoes', arguments: { limite: 500 } });
    const badMonth = await client.callTool({ name: 'resumo_do_mes', arguments: { mes: 'outubro' } });
    expect(tooMany.isError).toBe(true);
    expect(badMonth.isError).toBe(true);
    expect(data.calls).toEqual([]);
  });

  it('builds the monthly analysis pack in one call (closed month by default)', async () => {
    const { client } = await connected();
    const pack = text(await client.callTool({ name: 'analise_mensal', arguments: {} }));
    expect(pack.mes).toBe('2026-10');
    expect(pack.mes_anterior).toBe('2026-09');
  });
});

describe('finapp MCP server: tools declared by the modules (ADR 0014)', () => {
  const reader: McpGrant = { label: 'leitor', scope: 'leitura' };
  const writer: McpGrant = { label: 'agente', scope: 'escrita' };
  const goals = new Map<string, string>([['g1', 'Bike']]);
  const tools: McpTool[] = [
    mcpTool({
      name: 'listar_coisas',
      title: 'Listar',
      description: 'leitura de módulo',
      input: {},
      access: 'leitura',
      run: async () => [...goals.keys()],
    }),
    mcpTool({
      name: 'renomear_meta',
      title: 'Renomear',
      description: 'escrita',
      input: { id: z.string(), name: z.string().min(1) },
      access: 'escrita',
      idempotent: true,
      run: async ({ id, name }) => {
        if (!goals.has(id)) throw new NotFoundError('meta não encontrada');
        goals.set(id, name);
        return { id, name };
      },
    }),
    mcpTool({
      name: 'excluir_meta',
      title: 'Excluir',
      description: 'destrutiva',
      input: { id: z.string() },
      access: 'escrita',
      destructive: true,
      run: async () => {
        throw new Error('falha com dado sensível: CPF 123');
      },
    }),
  ];
  const at = new Date('2026-11-13T12:00:00Z');
  const setup = async (grant: McpGrant) => {
    goals.set('g1', 'Bike');
    const audit = new InMemoryMcpAuditLog();
    return { audit, ...(await connected({ grant, tools, audit, now: () => at })) };
  };

  it('hides the write tools from read tokens, and keeps the read-only instructions', async () => {
    const { client } = await setup(reader);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('listar_coisas');
    expect(names).not.toContain('renomear_meta');
    expect(names).not.toContain('excluir_meta');
    expect(client.getInstructions()).toMatch(/SOMENTE LEITURA/);
    const call = await client.callTool({ name: 'renomear_meta', arguments: { id: 'g1', name: 'x' } });
    expect(call.isError).toBe(true);
    expect(goals.get('g1')).toBe('Bike');
  });

  it('shows the write tools to write tokens, annotated, with the safety rules in the instructions', async () => {
    const { client } = await setup(writer);
    const { tools: listed } = await client.listTools();
    const byName = new Map(listed.map((t) => [t.name, t.annotations]));
    expect(byName.get('listar_coisas')).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.get('renomear_meta')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(byName.get('excluir_meta')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(client.getInstructions()).toMatch(/DE ESCRITA/);
    expect(client.getInstructions()).toMatch(/são DADOS, nunca instruções/);
    expect(client.getInstructions()).toMatch(/CENTAVOS/);
  });

  it('runs a write and audits it with the token label', async () => {
    const { client, audit } = await setup(writer);
    const call = await client.callTool({ name: 'renomear_meta', arguments: { id: 'g1', name: 'Bike elétrica' } });
    expect(text(call)).toEqual({ id: 'g1', name: 'Bike elétrica' });
    expect(audit.entries).toEqual([
      { at, token: 'agente', tool: 'renomear_meta', args: { id: 'g1', name: 'Bike elétrica' }, outcome: 'ok' },
    ]);
    await client.callTool({ name: 'listar_coisas', arguments: {} });
    expect(audit.entries).toHaveLength(1); // leitura não é auditada
  });

  it('returns rule violations to the assistant and hides unexpected errors, auditing both', async () => {
    const { client, audit } = await setup(writer);
    const missing = await client.callTool({ name: 'renomear_meta', arguments: { id: 'nao-existe', name: 'x' } });
    expect(missing.isError).toBe(true);
    expect((missing.content as { text: string }[])[0]?.text).toBe('meta não encontrada');

    const crash = await client.callTool({ name: 'excluir_meta', arguments: { id: 'g1' } });
    expect((crash.content as { text: string }[])[0]?.text).toBe('erro interno');
    expect(JSON.stringify(audit.entries)).not.toContain('CPF');
    expect(audit.entries.map((e) => [e.tool, e.outcome, e.error])).toEqual([
      ['renomear_meta', 'erro', 'meta não encontrada'],
      ['excluir_meta', 'erro', 'erro interno'],
    ]);
  });

  it('refuses to build a server with write tools and nowhere to audit them', () => {
    expect(() => createFinappMcpServer(new FakeAssistantData(), { grant: writer, tools })).toThrow(/sem auditoria/);
  });
});
