import {
  CategorizeCommandSchema,
  ClassifyCommandSchema,
  CreateCategoryCommandSchema,
  CreateRuleCommandSchema,
  MergeCategoryCommandSchema,
  RulePreviewCommandSchema,
  UpdateCategoryCommandSchema,
  UpdateRuleCommandSchema,
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
import { CategoriesController, CategorizationRulesController, TransactionsController } from './ledger.controllers.js';
import { ReportsController } from './reports.controller.js';
import { SyncController } from './sync.controller.js';

const id = (what: string) => z.string().min(1).describe(`Id ${what} (das ferramentas de leitura).`);
const cents = '(em centavos: R$ 12,34 = 1234)';

/**
 * Ferramentas MCP do livro-caixa (ADR 0014). Chamam os mesmos controllers da API HTTP, com os mesmos contratos:
 * o comportamento é o da tela, sem regra duplicada.
 */
@ProvidesMcpTools()
export class LedgerMcpTools implements McpToolProvider {
  constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

  private get<T>(type: Type<T>): T {
    return this.moduleRef.get(type, { strict: true });
  }

  mcpTools(): McpTool[] {
    const transactions = () => this.get(TransactionsController);
    const categories = () => this.get(CategoriesController);
    const rules = () => this.get(CategorizationRulesController);
    return [
      mcpTool({
        name: 'listar_categorias',
        title: 'Listar categorias',
        description:
          'Todas as categorias: id, nome, tipo (expense, income, transfer), grupo (parentId) e se está arquivada. ' +
          'Use os ids para categorizar transações e criar regras.',
        input: {},
        access: 'leitura',
        run: () => categories().list(),
      }),
      mcpTool({
        name: 'listar_regras',
        title: 'Listar regras de categorização',
        description:
          'Regras que categorizam transações automaticamente: condições, categoria, prioridade e se está ativa. ' +
          `Valores mínimo e máximo ${cents}. Regras "default-rule-*" vêm de fábrica: podem ser desligadas, não excluídas.`,
        input: {},
        access: 'leitura',
        run: () => rules().list(),
      }),
      mcpTool({
        name: 'previa_regra',
        title: 'Prévia de uma regra',
        description:
          'Quantas transações dos últimos 12 meses uma regra nova (ou a edição de uma regra, com `replacing`) mudaria, ' +
          'com exemplos. Não salva nada: use antes de criar_regra ou editar_regra.',
        input: RulePreviewCommandSchema.shape,
        access: 'leitura',
        run: (args) => rules().previewRule(RulePreviewCommandSchema.parse(args)),
      }),
      mcpTool({
        name: 'categorizar_transacao',
        title: 'Categorizar transação',
        description:
          'Define a categoria de uma transação (como corrigir na tela). O app aprende pela contraparte e aplica a ' +
          'mesma categoria às transações parecidas; uma entrada numa categoria de gasto vira devolução.',
        input: { transactionId: id('da transação'), ...CategorizeCommandSchema.shape },
        access: 'escrita',
        idempotent: true,
        run: ({ transactionId, ...body }) =>
          transactions().setCategory(transactionId, CategorizeCommandSchema.parse(body)),
      }),
      mcpTool({
        name: 'classificar_transacao',
        title: 'Classificar transação',
        description:
          'Muda o tipo: expense (gasto), income (renda), internal_transfer (entre as próprias contas; informe a outra ' +
          'ponta em counterpartId para ligar as duas) ou ignored (não conta em nada).',
        input: { transactionId: id('da transação'), ...ClassifyCommandSchema.shape },
        access: 'escrita',
        idempotent: true,
        run: ({ transactionId, ...body }) =>
          transactions().setClassification(transactionId, ClassifyCommandSchema.parse(body)),
      }),
      mcpTool({
        name: 'criar_categoria',
        title: 'Criar categoria',
        description: 'Cria um grupo (sem parentId) ou uma subcategoria (parentId = id do grupo).',
        input: CreateCategoryCommandSchema.shape,
        access: 'escrita',
        run: (args) => categories().add(CreateCategoryCommandSchema.parse(args)),
      }),
      mcpTool({
        name: 'editar_categoria',
        title: 'Renomear ou arquivar categoria',
        description: 'Renomeia (name) ou arquiva (archived: true) uma categoria. Arquivar não apaga as transações.',
        input: { id: id('da categoria'), ...UpdateCategoryCommandSchema.shape },
        access: 'escrita',
        idempotent: true,
        run: ({ id: categoryId, ...body }) => categories().change(categoryId, UpdateCategoryCommandSchema.parse(body)),
      }),
      mcpTool({
        name: 'mesclar_categoria',
        title: 'Mesclar categorias',
        description:
          'Move todas as transações e regras da categoria `id` para `into` e arquiva a de origem. Não há desfazer ' +
          'automático: confirme com o usuário antes.',
        input: { id: id('da categoria de origem'), ...MergeCategoryCommandSchema.shape },
        access: 'escrita',
        destructive: true,
        run: ({ id: categoryId, ...body }) =>
          categories().mergeInto(categoryId, MergeCategoryCommandSchema.parse(body)),
      }),
      mcpTool({
        name: 'criar_regra',
        title: 'Criar regra de categorização',
        description:
          'Cria uma regra (pelo menos uma condição: descriptionContains, descriptionPattern, counterpartyNameContains, ' +
          `accountId, paymentMethod, direction, minAmountCents/maxAmountCents ${cents}). Por padrão reaplica aos ` +
          'últimos 12 meses (sem mexer nas categorias manuais). Devolve a regra e quantas transações mudaram.',
        input: CreateRuleCommandSchema.shape,
        access: 'escrita',
        run: (args) => rules().add(CreateRuleCommandSchema.parse(args)),
      }),
      mcpTool({
        name: 'editar_regra',
        title: 'Editar regra de categorização',
        description:
          'Muda só os campos informados; `null` remove uma condição. Reaplica aos últimos 12 meses. Para desligar ' +
          `uma regra: enabled false. Valores ${cents}.`,
        input: { id: id('da regra'), ...UpdateRuleCommandSchema.shape },
        access: 'escrita',
        idempotent: true,
        run: ({ id: ruleId, ...body }) => rules().change(ruleId, UpdateRuleCommandSchema.parse(body)),
      }),
      mcpTool({
        name: 'excluir_regra',
        title: 'Excluir regra de categorização',
        description:
          'Exclui uma regra criada pelo usuário e recategoriza o que ela tinha categorizado. Regras de fábrica ' +
          '("default-rule-*") não podem ser excluídas: use editar_regra com enabled false.',
        input: { id: id('da regra') },
        access: 'escrita',
        destructive: true,
        run: ({ id: ruleId }) => rules().removeRule(ruleId),
      }),
      mcpTool({
        name: 'dispensar_recorrencia',
        title: 'Marcar como não recorrente',
        description:
          'A recorrência (pela `chave` da ferramenta recorrencias) deixa de aparecer nos relatórios e compromissos.',
        input: { chave: z.string().min(1).describe('A `chave` devolvida pela ferramenta recorrencias.') },
        access: 'escrita',
        idempotent: true,
        run: async ({ chave }) => {
          await this.get(ReportsController).dismiss(chave);
          return { ok: true };
        },
      }),
      mcpTool({
        name: 'sincronizar_agora',
        title: 'Sincronizar com o Open Finance',
        description:
          'Busca transações novas em todas as conexões (como o botão "Sincronizar agora"). `full: true` revisita ' +
          '12 meses (mais lento). Devolve o resumo da sincronização.',
        input: { full: z.boolean().default(false) },
        access: 'escrita',
        openWorld: true,
        run: ({ full }) => this.get(SyncController).run({ full }),
      }),
    ];
  }
}
