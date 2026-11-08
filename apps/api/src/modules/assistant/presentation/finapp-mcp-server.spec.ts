import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { AssistantData, type Json, type TransactionQuery } from '../application/assistant-data.js';
import { createFinappMcpServer, MAX_TRANSACTIONS } from './finapp-mcp-server.js';

/** Dublê (stub + spy) da porta: registra as chamadas e devolve um eco. */
class FakeAssistantData extends AssistantData {
  readonly calls: unknown[][] = [];
  private record(name: string, ...args: unknown[]): Json {
    this.calls.push([name, ...args]);
    return { ferramenta: name, args };
  }
  async monthSummary(month?: string) {
    return this.record('monthSummary', month);
  }
  async spendingByCategory(month: string | undefined, level: 'grupo' | 'categoria') {
    return this.record('spendingByCategory', month, level);
  }
  async transactions(query: TransactionQuery) {
    return this.record('transactions', query);
  }
  async commitments() {
    return this.record('commitments');
  }
  async recurring() {
    return this.record('recurring');
  }
  async income(months: number) {
    return this.record('income', months);
  }
  async goals(deadline?: string) {
    return this.record('goals', deadline);
  }
}

async function connected() {
  const data = new FakeAssistantData();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createFinappMcpServer(data).connect(serverSide);
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
      'compromissos_futuros',
      'gastos_por_categoria',
      'listar_transacoes',
      'metas_e_viabilidade',
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
    expect(text(await client.callTool({ name: 'resumo_do_mes', arguments: { mes: '2026-10' } }))).toEqual({
      ferramenta: 'monthSummary',
      args: ['2026-10'],
    });
    await client.callTool({ name: 'gastos_por_categoria', arguments: {} });
    await client.callTool({ name: 'listar_transacoes', arguments: { busca: 'mercado' } });
    await client.callTool({ name: 'metas_e_viabilidade', arguments: { prazo: '2028-12' } });
    expect(data.calls).toEqual([
      ['monthSummary', '2026-10'],
      ['spendingByCategory', undefined, 'categoria'],
      ['transactions', { busca: 'mercado', limite: 30 }],
      ['goals', '2028-12'],
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
});
