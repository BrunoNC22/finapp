import {
  type MonthlyReportDto,
  type MonthlyReportQuery,
  MonthlyReportQuerySchema,
  type RecurringDto,
} from '@finapp/contracts';
import { Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ZodPipe } from '../../../shared/presentation/zod-pipe.js';
import { RecurrenceDismissals } from '../application/ports/recurrence-dismissals.js';
import { GetMonthlyReport } from '../application/use-cases/monthly-report.js';
import type { Recurring } from '../domain/reports/recurring-detector.js';
import { money, toTransactionDto } from './dto.js';

const toRecurringDto = (r: Recurring): RecurringDto => ({
  key: r.key,
  label: r.label,
  occurrences: r.occurrences,
  typicalAmount: money(r.typicalAmount),
  intervalDays: r.intervalDays,
  lastOn: r.lastOn.toString(),
  nextExpectedOn: r.nextExpectedOn.toString(),
  annualCost: money(r.annualCost),
  ...(r.categoryId ? { categoryId: r.categoryId } : {}),
});

@Controller('reports')
export class ReportsController {
  constructor(
    @Inject(GetMonthlyReport) private readonly report: GetMonthlyReport,
    @Inject(RecurrenceDismissals) private readonly dismissals: RecurrenceDismissals,
  ) {}

  @Get('monthly')
  async monthly(@Query(new ZodPipe(MonthlyReportQuerySchema)) query: MonthlyReportQuery): Promise<MonthlyReportDto> {
    const r = await this.report.execute(query.month);
    return {
      month: r.month,
      cashFlow: r.cashFlow.map((m) => ({
        month: m.month,
        income: money(m.income),
        spending: money(m.spending),
        net: money(m.net),
      })),
      categories: r.categories.map((c) => ({
        categoryId: c.categoryId,
        groupId: c.groupId,
        spent: money(c.spent),
        count: c.count,
        previousAverage: money(c.previousAverage),
        changePercent: c.changePercent,
      })),
      byAccount: r.byAccount.map((a) => ({ accountId: a.key, spent: money(a.spent), count: a.count })),
      byPaymentMethod: r.byPaymentMethod.map((p) => ({
        paymentMethod: p.key as MonthlyReportDto['byPaymentMethod'][number]['paymentMethod'],
        spent: money(p.spent),
        count: p.count,
      })),
      topExpenses: r.topExpenses.map(toTransactionDto),
      outliers: r.outliers.map((o) => ({
        transaction: toTransactionDto(o.transaction),
        timesTheMedian: o.timesTheMedian,
      })),
      recurring: r.recurring.map(toRecurringDto),
      commitments: r.commitments.map((c) => ({
        month: c.month,
        installments: money(c.installments),
        recurring: money(c.recurring),
        total: money(c.total),
      })),
    };
  }

  /** "Não é recorrente": a recorrência some dos relatórios e dos compromissos. */
  @Post('recurring/:key/dismiss')
  @HttpCode(204)
  async dismiss(@Param('key') key: string): Promise<void> {
    await this.dismissals.dismiss(key);
  }
}
