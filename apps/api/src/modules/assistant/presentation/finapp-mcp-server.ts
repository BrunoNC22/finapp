import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AssistantData, Json } from '../application/assistant-data.js';
import { monthlyAnalysisPack } from '../application/monthly-analysis.js';

const MONTH = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .describe('Mês no formato AAAA-MM. Sem informar: o mês corrente.');
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Limite de transações por chamada: detalhe só quando pedido e sempre limitado. */
export const MAX_TRANSACTIONS = 100;

const INSTRUCTIONS = [
  'Ferramentas SOMENTE LEITURA sobre as finanças pessoais do dono desta instância do finapp.',
  'Convenções: valores em reais (BRL). "Gasto" e "renda" são reais: transferências entre as contas do próprio',
  'usuário e devoluções (ex.: corrida cancelada) nunca contam como renda. Devoluções reduzem o gasto da categoria.',
  'Nas transações, valor negativo = dinheiro que saiu. Prefira os resumos e agregados; liste transações só quando',
  'precisar de detalhe. Cenários de renda: piso (só renda segura e já ativa), provável (inclui pendentes, sem alto',
  'risco), otimista (tudo que não acabou). Metas são realizadas em sequência; uma meta só começa se sobrar pelo',
  'menos a folga mínima da renda todo mês durante as parcelas.',
].join(' ');

const result = (data: Json) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] });
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** Servidor MCP do finapp: ferramentas de leitura que chamam a porta AssistantData (sem acesso ao banco). */
export function createFinappMcpServer(data: AssistantData): McpServer {
  const server = new McpServer({ name: 'finapp', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'analise_mensal',
    {
      title: 'Pacote da análise mensal',
      description:
        'Tudo o que a análise do mês precisa numa chamada: resumo do mês e do anterior, gastos por grupo e categoria, ' +
        'os gastos do mês (até 100), compromissos futuros, recorrências, renda por cenário (12 meses), metas com ' +
        'viabilidade e oportunidades de renda abertas. Sem mês: o último mês fechado.',
      inputSchema: { mes: MONTH.optional().describe('Mês analisado (AAAA-MM). Sem informar: o último mês fechado.') },
      annotations: readOnly,
    },
    async ({ mes }) => result(await monthlyAnalysisPack(data, mes)),
  );

  server.registerTool(
    'resumo_do_mes',
    {
      title: 'Resumo financeiro do mês',
      description:
        'Quanto entrou, saiu e sobrou no mês, comparado à média dos 3 meses anteriores; maiores categorias de gasto ' +
        '(com variação contra a média), de onde veio a renda e quanto já está comprometido no mês seguinte.',
      inputSchema: { mes: MONTH.optional() },
      annotations: readOnly,
    },
    async ({ mes }) => result(await data.monthSummary(mes)),
  );

  server.registerTool(
    'gastos_por_categoria',
    {
      title: 'Gastos por categoria',
      description:
        'Gasto real do mês por categoria (ou por grupo, ex.: Alimentação, Transporte), com a média dos 3 meses ' +
        'anteriores e a variação. Devoluções já descontadas.',
      inputSchema: { mes: MONTH.optional(), nivel: z.enum(['grupo', 'categoria']).default('categoria') },
      annotations: readOnly,
    },
    async ({ mes, nivel }) => result(await data.spendingByCategory(mes, nivel)),
  );

  server.registerTool(
    'listar_transacoes',
    {
      title: 'Listar transações',
      description:
        `Transações com filtros, das mais recentes para as mais antigas, no máximo ${MAX_TRANSACTIONS} por chamada. ` +
        'Sem documentos (CPF/CNPJ). Valor negativo = saiu. Use para investigar um gasto específico.',
      inputSchema: {
        de: DATE.optional().describe('Data inicial (AAAA-MM-DD), inclusive.'),
        ate: DATE.optional().describe('Data final (AAAA-MM-DD), inclusive.'),
        categoria: z
          .string()
          .optional()
          .describe('Id da categoria, ex.: "alimentacao.delivery" ou o grupo "alimentacao".'),
        tipo: z.enum(['gasto', 'entrada', 'entre_contas', 'ignorada']).optional(),
        busca: z
          .string()
          .min(2)
          .max(80)
          .optional()
          .describe('Trecho da descrição (sem acento, sem diferenciar maiúsculas).'),
        limite: z.number().int().min(1).max(MAX_TRANSACTIONS).default(30),
      },
      annotations: readOnly,
    },
    async (args) => result(await data.transactions(args)),
  );

  server.registerTool(
    'compromissos_futuros',
    {
      title: 'Compromissos futuros',
      description:
        'Compras parceladas em andamento (parcela, quanto falta, quando acaba) e o total já comprometido em cada um ' +
        'dos próximos 12 meses (parcelas + recorrências).',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => result(await data.commitments()),
  );

  server.registerTool(
    'recorrencias',
    {
      title: 'Gastos recorrentes',
      description: 'Assinaturas e contas que se repetem: valor típico, intervalo, próxima cobrança e custo anual.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => result(await data.recurring()),
  );

  server.registerTool(
    'renda_e_cenarios',
    {
      title: 'Renda e cenários',
      description:
        'Fontes de renda (valor, período, risco, situação), o que cada uma pagou no mês corrente e a renda projetada ' +
        'mês a mês nos cenários piso, provável e otimista.',
      inputSchema: { meses: z.number().int().min(6).max(60).default(24) },
      annotations: readOnly,
    },
    async ({ meses }) => result(await data.income(meses)),
  );

  server.registerTool(
    'metas_e_viabilidade',
    {
      title: 'Metas e viabilidade',
      description:
        'Metas na ordem de realização: custos (largada, parcelas, total), efeito no orçamento, quando cada uma cabe ' +
        'em cada cenário, o que falta e as alavancas (renda extra ou cortes) quando não cabe, e a renda mensal ' +
        'estável necessária para realizar cada meta (renda-alvo), opcionalmente até um prazo.',
      inputSchema: { prazo: MONTH.optional().describe('Realizar cada meta até este mês (AAAA-MM).') },
      annotations: readOnly,
    },
    async ({ prazo }) => result(await data.goals(prazo)),
  );

  server.registerTool(
    'perfil_profissional',
    {
      title: 'Perfil profissional',
      description:
        'Resumo, preferências de trabalho (freela/PJ/CLT, remoto), nível de inglês por habilidade, horas disponíveis, ' +
        'skills, experiências (as sem fim estão em andamento), formação, links e o currículo em Markdown. Use para ' +
        'sugerir caminhos realistas de aumento de renda.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => result(await data.profile()),
  );

  server.registerTool(
    'oportunidades',
    {
      title: 'Oportunidades de renda',
      description:
        'Oportunidades que o usuário acompanha (freelas, clientes recorrentes, vagas, bolsas), com status ' +
        '(ideia, aplicada, conversa, fechada, perdida), valores estimados (por mês ou de uma vez) e notas.',
      inputSchema: { apenas_abertas: z.boolean().default(true) },
      annotations: readOnly,
    },
    async ({ apenas_abertas }) => result(await data.opportunities(apenas_abertas)),
  );

  return server;
}
