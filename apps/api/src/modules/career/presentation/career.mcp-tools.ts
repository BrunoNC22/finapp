import { CareerProfileSchema, CreateOpportunityCommandSchema, UpdateOpportunityCommandSchema } from '@finapp/contracts';
import { Inject, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { z } from 'zod';
import {
  type McpTool,
  type McpToolProvider,
  mcpTool,
  ProvidesMcpTools,
} from '../../../shared/presentation/mcp-tools.js';
import { CareerController } from './career.controller.js';

const id = z.string().min(1).describe('Id da oportunidade (da ferramenta oportunidades).');

/** Ferramentas MCP de carreira: perfil e quadro de oportunidades, pelo mesmo controller da API HTTP (ADR 0014). */
@ProvidesMcpTools()
export class CareerMcpTools implements McpToolProvider {
  constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

  mcpTools(): McpTool[] {
    const career = () => this.moduleRef.get(CareerController, { strict: true });
    return [
      mcpTool({
        name: 'editar_perfil',
        title: 'Editar perfil profissional',
        description:
          'Atualiza o perfil profissional: os campos informados substituem os atuais e os outros ficam como estão. ' +
          'Listas (skills, experiences, education, links) são substituídas inteiras: envie a lista completa. ' +
          'Datas em AAAA-MM. resumeMarkdown é o currículo em Markdown. Se ainda não há perfil, envie todos os campos.',
        input: CareerProfileSchema.partial().shape,
        access: 'escrita',
        idempotent: true,
        run: async (changes) => {
          const current = await career()
            .profile()
            .catch((error: unknown) => {
              if (error instanceof NotFoundException) return {};
              throw error;
            });
          return career().save(CareerProfileSchema.parse({ ...current, ...changes }));
        },
      }),
      mcpTool({
        name: 'criar_oportunidade',
        title: 'Criar oportunidade de renda',
        description:
          'Adiciona ao quadro de Carreira. kind: freela, recorrente, vaga, bolsa ou outro. status: ideia, aplicada, ' +
          'conversa, fechada ou perdida. Estimativas em CENTAVOS (por mês e/ou de uma vez).',
        input: CreateOpportunityCommandSchema.shape,
        access: 'escrita',
        run: (args) => career().add(CreateOpportunityCommandSchema.parse(args)),
      }),
      mcpTool({
        name: 'editar_oportunidade',
        title: 'Editar oportunidade de renda',
        description:
          'Muda só os campos informados (ex.: status "conversa" depois de uma reunião). null limpa estimativas e link. ' +
          'Estimativas em CENTAVOS.',
        input: { id, ...UpdateOpportunityCommandSchema.shape },
        access: 'escrita',
        idempotent: true,
        run: ({ id: opportunityId, ...body }) =>
          career().change(opportunityId, UpdateOpportunityCommandSchema.parse(body)),
      }),
      mcpTool({
        name: 'excluir_oportunidade',
        title: 'Excluir oportunidade de renda',
        description: 'Exclui a oportunidade do quadro. Para registrar que não deu certo, prefira status "perdida".',
        input: { id },
        access: 'escrita',
        destructive: true,
        run: async ({ id: opportunityId }) => {
          await career().delete(opportunityId);
          return { ok: true };
        },
      }),
    ];
  }
}
