import { AnalysisOutcomeSchema } from '@finapp/contracts';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import {
  type McpTool,
  type McpToolProvider,
  mcpTool,
  ProvidesMcpTools,
} from '../../../shared/presentation/mcp-tools.js';
import { GetAnalysisReminder, RecordMonthlyAnalysis } from '../application/monthly-analysis-routine.js';

/** Ferramenta MCP da rotina mensal (ADR 0014). */
@ProvidesMcpTools()
export class RoutineMcpTools implements McpToolProvider {
  constructor(
    @Inject(RecordMonthlyAnalysis) private readonly record: RecordMonthlyAnalysis,
    @Inject(GetAnalysisReminder) private readonly reminder: GetAnalysisReminder,
  ) {}

  mcpTools(): McpTool[] {
    return [
      mcpTool({
        name: 'registrar_analise_mensal',
        title: 'Registrar a análise mensal',
        description:
          'Marca a análise financeira de um mês fechado como feita (ou pulada): o lembrete some do Painel. ' +
          'Sem mês: o último mês fechado.',
        input: {
          mes: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional()
            .describe('AAAA-MM; no máximo o último mês fechado.'),
          resultado: AnalysisOutcomeSchema.default('feita'),
        },
        access: 'escrita',
        idempotent: true,
        run: async ({ mes, resultado }) => {
          const saved = await this.record.execute({ ...(mes ? { month: mes } : {}), outcome: resultado, via: 'mcp' });
          const reminder = await this.reminder.execute();
          return { mes: saved.month, resultado: saved.outcome, lembrete_pendente: reminder.pending };
        },
      }),
    ];
  }
}
