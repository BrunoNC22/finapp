import { describe, expect, it } from 'vitest';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import { InMemoryRecurrenceDismissals } from '../../../../../test/doubles/in-memory-sync.js';
import { InMemoryTransactionRepository } from '../../../../../test/doubles/in-memory-transaction-repository.js';
import { Money } from '../../../../shared/kernel/money.js';
import { Installment } from '../../domain/installment.js';
import { GetMonthlyReport } from './monthly-report.js';

describe('GetMonthlyReport', () => {
  it('assembles the month report and the next 12 months of commitments (installments + recurring)', async () => {
    const transactions = new InMemoryTransactionRepository();
    const subscription = ['2026-08-12', '2026-09-12', '2026-10-12'].map((d) =>
      aTransaction().on(d).withAmount(-3990).withDescription('STREAMING').withPaymentMethod('card_purchase').build(),
    );
    const parcel = aTransaction()
      .on('2026-10-15')
      .withAmount(-10000)
      .withDescription('LOJA')
      .withPaymentMethod('card_purchase')
      .withInstallment(Installment.of({ number: 1, total: 3, installmentAmount: Money.fromCents(10000) }))
      .build();
    const salary = aTransaction()
      .on('2026-10-05')
      .withAmount(120000)
      .withPaymentMethod('other')
      .withDescription('SALARIO')
      .build();
    await transactions.saveMany([...subscription, parcel, salary]);
    const dismissals = new InMemoryRecurrenceDismissals();

    const report = await new GetMonthlyReport(
      transactions,
      dismissals,
      new FixedClock(new Date('2026-11-07T12:00:00Z')),
    ).execute('2026-10');

    expect(report.cashFlow).toHaveLength(12);
    expect(report.cashFlow.at(-1)).toMatchObject({ month: '2026-10' });
    expect(report.cashFlow.at(-1)?.spending.cents).toBe(13990);
    expect(report.recurring.map((r) => r.label)).toEqual(['streaming']);
    expect(
      report.commitments.slice(0, 3).map((c) => [c.month, c.installments.cents, c.recurring.cents, c.total.cents]),
    ).toEqual([
      ['2026-11', 10000, 3990, 13990],
      ['2026-12', 10000, 3990, 13990],
      ['2027-01', 0, 3990, 3990],
    ]);

    await dismissals.dismiss(report.recurring[0]?.key ?? '');
    const again = await new GetMonthlyReport(
      transactions,
      dismissals,
      new FixedClock(new Date('2026-11-07T12:00:00Z')),
    ).execute('2026-10');
    expect(again.recurring).toHaveLength(0);
  });

  it('defaults to the current month', async () => {
    const report = await new GetMonthlyReport(
      new InMemoryTransactionRepository(),
      new InMemoryRecurrenceDismissals(),
      new FixedClock(new Date('2026-11-07T12:00:00Z')),
    ).execute();
    expect(report.month).toBe('2026-11');
  });
});
