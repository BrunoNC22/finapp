import { describe, expect, it } from 'vitest';
import { brl, INSTALLMENTS } from '../../../test/finance-fixtures';
import { installmentProgress, summarizeInstallments } from './installment-summary';

describe('installment summary', () => {
  it('computes progress of one purchase', () => {
    expect(installmentProgress(INSTALLMENTS[0] as never)).toEqual({
      paid: 4,
      installmentCents: 30000,
      remainingCents: 180000,
      lastMonth: '2027-04',
    });
  });

  it('adds up all purchases and finds the last month with an installment', () => {
    const other = {
      ...INSTALLMENTS[0],
      merchant: 'Outra',
      remainingCount: 1,
      projected: [{ number: 3, expectedMonth: '2027-06', amount: brl(-5000) }],
    } as never;
    expect(summarizeInstallments([INSTALLMENTS[0] as never, other])).toEqual({
      remainingCents: 185000,
      remainingInstallments: 7,
      lastMonth: '2027-06',
    });
  });
});
