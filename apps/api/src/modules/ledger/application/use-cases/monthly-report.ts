import type { Clock } from '../../../../shared/application/clock.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { type Recurring, RecurringDetector } from '../../domain/reports/recurring-detector.js';
import {
  breakdownBy,
  type CategorySpending,
  cashFlow,
  categoryBreakdown,
  type KeyedSpending,
  type MonthFlow,
  type Outlier,
  outliers,
  topExpenses,
} from '../../domain/reports/spending-reports.js';
import { InstallmentGrouper } from '../../domain/services/installment-grouper.js';
import type { Transaction } from '../../domain/transaction.js';
import type { RecurrenceDismissals } from '../ports/recurrence-dismissals.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

export interface MonthlyCommitment {
  readonly month: string;
  readonly installments: Money;
  readonly recurring: Money;
  readonly total: Money;
}

export interface MonthlyReport {
  readonly month: string;
  readonly cashFlow: MonthFlow[];
  readonly categories: CategorySpending[];
  readonly byAccount: KeyedSpending[];
  readonly byPaymentMethod: KeyedSpending[];
  readonly topExpenses: Transaction[];
  readonly outliers: Outlier[];
  readonly recurring: Recurring[];
  readonly commitments: MonthlyCommitment[];
}

/**
 * Relatório de um mês: fluxo de caixa dos 12 meses até ele, gasto por categoria (com comparação),
 * por conta e forma de pagamento, maiores gastos, anomalias, recorrências e compromissos dos
 * próximos 12 meses (parcelas a vencer + recorrências ativas).
 */
export class GetMonthlyReport {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly dismissals: RecurrenceDismissals,
    private readonly clock: Clock,
    private readonly timeZone = 'America/Sao_Paulo',
  ) {}

  async execute(month?: string): Promise<MonthlyReport> {
    const today = LocalDate.fromInstant(this.clock.now(), this.timeZone);
    const target = month ?? today.monthKey;
    const firstDay = LocalDate.parse(`${target}-01`);
    const lastDay = firstDay.addMonths(1).addDays(-1);
    // Histórico de 24 meses: comparações, anomalias, recorrências e parcelamentos longos.
    const history = await this.transactions.findInPeriod({ from: firstDay.addMonths(-24), to: lastDay });
    const months = Array.from({ length: 12 }, (_, i) => firstDay.addMonths(i - 11).monthKey);
    const asOf = lastDay.isBefore(today) ? lastDay : today;
    const recurring = new RecurringDetector().detect(history, asOf, await this.dismissals.all());

    return {
      month: target,
      cashFlow: cashFlow(history, months),
      categories: categoryBreakdown(history, target),
      byAccount: breakdownBy(history, target, (t) => t.accountId),
      byPaymentMethod: breakdownBy(history, target, (t) => t.paymentMethod),
      topExpenses: topExpenses(history, target, 5),
      outliers: outliers(history, target),
      recurring,
      commitments: this.commitments(history, recurring, firstDay.addMonths(1)),
    };
  }

  private commitments(
    history: readonly Transaction[],
    recurring: readonly Recurring[],
    from: LocalDate,
  ): MonthlyCommitment[] {
    const grouper = new InstallmentGrouper();
    const installments = grouper.commitments(grouper.group(history.filter((t) => t.isInstallment)), from, 12);
    const recurringPerMonth = Money.sum(recurring.map((r) => r.typicalAmount));
    return installments.map(({ month, amount }) => ({
      month,
      installments: amount,
      recurring: recurringPerMonth,
      total: amount.add(recurringPerMonth),
    }));
  }
}
