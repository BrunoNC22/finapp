import { type AnalysisReminderDto, type RecordAnalysisCommand, RecordAnalysisCommandSchema } from '@finapp/contracts';
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ZodPipe } from '../../../shared/presentation/zod-pipe.js';
import {
  type AnalysisReminder,
  GetAnalysisReminder,
  RecordMonthlyAnalysis,
} from '../application/monthly-analysis-routine.js';

const toDto = (r: AnalysisReminder): AnalysisReminderDto => ({
  month: r.month,
  pending: r.pending,
  ...(r.record ? { outcome: r.record.outcome, recordedAt: r.record.at.toISOString() } : {}),
});

/** Rotina mensal: o lembrete da análise do mês no app. */
@Controller('routine')
export class RoutineController {
  constructor(
    @Inject(GetAnalysisReminder) private readonly reminder: GetAnalysisReminder,
    @Inject(RecordMonthlyAnalysis) private readonly record: RecordMonthlyAnalysis,
  ) {}

  @Get('analysis')
  async get(): Promise<AnalysisReminderDto> {
    return toDto(await this.reminder.execute());
  }

  /** "Já fiz" ou "Pular este mês" no app. Devolve o lembrete atualizado. */
  @Post('analysis/:month')
  @HttpCode(200)
  async mark(
    @Param('month') month: string,
    @Body(new ZodPipe(RecordAnalysisCommandSchema)) body: RecordAnalysisCommand,
  ): Promise<AnalysisReminderDto> {
    await this.record.execute({ month, outcome: body.outcome, via: 'app' });
    return toDto(await this.reminder.execute());
  }
}
