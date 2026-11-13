import {
  CreateIncomeSourceCommandSchema,
  GoalCommandSchema,
  ReorderGoalsCommandSchema,
  UpdateIncomeSourceCommandSchema,
} from '@finapp/contracts';
import { Inject, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { z } from 'zod';
import {
  type McpTool,
  type McpToolProvider,
  mcpTool,
  ProvidesMcpTools,
} from '../../../shared/presentation/mcp-tools.js';
import { GoalsController } from './goals.controller.js';
import { IncomeController } from './income.controller.js';

const id = (what: string) => z.string().min(1).describe(`Id ${what} (das ferramentas de leitura).`);

/** Ferramentas MCP de planejamento: metas e fontes de renda, pelos mesmos controllers da API HTTP (ADR 0014). */
@ProvidesMcpTools()
export class PlanningMcpTools implements McpToolProvider {
  constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

  private get<T>(type: Type<T>): T {
    return this.moduleRef.get(type, { strict: true });
  }

  mcpTools(): McpTool[] {
    const goals = () => this.get(GoalsController);
    const income = () => this.get(IncomeController);
    const goalDescription =
      'Valores em CENTAVOS (R$ 3.300,00 = 330000). kind: purchase (compra), debt (dívida), reserve (reserva) ou ' +
      'lifestyle (custo mensal, ex.: morar sozinho). financing: à vista, parcelado sem juros, financiado (Price) ou ' +
      'consórcio. recurringCosts: custos mensais que a meta traz; replacesCategoryId = a categoria de gasto que ela ' +
      'substitui (ex.: a bike substitui o transporte por app).';
    return [
      mcpTool({
        name: 'criar_meta',
        title: 'Criar meta',
        description: `Cria uma meta no fim da fila de realização. ${goalDescription}`,
        input: GoalCommandSchema.shape,
        access: 'escrita',
        run: (args) => goals().add(GoalCommandSchema.parse(args)),
      }),
      mcpTool({
        name: 'editar_meta',
        title: 'Editar meta',
        description: `Substitui todos os dados da meta \`id\` (envie a meta completa). ${goalDescription}`,
        input: { id: id('da meta'), ...GoalCommandSchema.shape },
        access: 'escrita',
        idempotent: true,
        run: ({ id: goalId, ...body }) => goals().change(goalId, GoalCommandSchema.parse(body)),
      }),
      mcpTool({
        name: 'excluir_meta',
        title: 'Excluir meta',
        description: 'Exclui a meta. Não há desfazer: confirme com o usuário antes.',
        input: { id: id('da meta') },
        access: 'escrita',
        destructive: true,
        run: async ({ id: goalId }) => {
          await goals().delete(goalId);
          return { ok: true };
        },
      }),
      mcpTool({
        name: 'reordenar_metas',
        title: 'Reordenar metas',
        description: 'Nova ordem de realização: os ids de TODAS as metas, da primeira para a última.',
        input: ReorderGoalsCommandSchema.shape,
        access: 'escrita',
        idempotent: true,
        run: async (args) => {
          await goals().reorder(ReorderGoalsCommandSchema.parse(args));
          return { ok: true };
        },
      }),
      mcpTool({
        name: 'criar_fonte_renda',
        title: 'Criar fonte de renda',
        description:
          'Cadastra uma fonte de renda. expectedMonthlyCents em CENTAVOS. startsOn/endsOn em AAAA-MM. risk: low, ' +
          'medium ou high (high fica fora do cenário provável). status: active ou pending (pending fica fora do piso).',
        input: CreateIncomeSourceCommandSchema.shape,
        access: 'escrita',
        run: (args) => income().add(CreateIncomeSourceCommandSchema.parse(args)),
      }),
      mcpTool({
        name: 'editar_fonte_renda',
        title: 'Editar fonte de renda',
        description:
          'Muda só os campos informados (ex.: status active quando uma bolsa for aprovada). endsOn null remove o fim; ' +
          'matcher null para de acompanhar os pagamentos. Valores em CENTAVOS.',
        input: { id: id('da fonte de renda'), ...UpdateIncomeSourceCommandSchema.shape },
        access: 'escrita',
        idempotent: true,
        run: ({ id: sourceId, ...body }) => income().change(sourceId, UpdateIncomeSourceCommandSchema.parse(body)),
      }),
      mcpTool({
        name: 'excluir_fonte_renda',
        title: 'Excluir fonte de renda',
        description: 'Exclui a fonte de renda (os cenários deixam de contar com ela). Confirme com o usuário antes.',
        input: { id: id('da fonte de renda') },
        access: 'escrita',
        destructive: true,
        run: async ({ id: sourceId }) => {
          await income().delete(sourceId);
          return { ok: true };
        },
      }),
    ];
  }
}
