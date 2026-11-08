import { describe, expect, it } from 'vitest';
import { goalCost } from './goal-cost';

describe('goalCost (mesma conta da API)', () => {
  it('Tabela Price: 24.000 − 4.800 em 48x a 1,99% a.m. = 624,68', () => {
    expect(
      goalCost({
        priceCents: 2_400_000,
        downPaymentCents: 480_000,
        oneTimeCostsCents: 120_000,
        financing: { kind: 'loan', installments: 48, monthlyRate: 0.0199 },
      }),
    ).toEqual({ upfrontCents: 600_000, installmentCents: 62_468, installments: 48, totalCents: 600_000 + 62_468 * 48 });
  });

  it('sem juros, consórcio e à vista', () => {
    const base = { priceCents: 330_000, downPaymentCents: 0, oneTimeCostsCents: 30_000 };
    expect(goalCost({ ...base, financing: { kind: 'interest_free', installments: 12 } }).installmentCents).toBe(27_500);
    expect(
      goalCost({
        priceCents: 2_400_000,
        downPaymentCents: 0,
        oneTimeCostsCents: 0,
        financing: { kind: 'consortium', installments: 72, adminFeeRate: 0.15 },
      }).installmentCents,
    ).toBe(38_333);
    expect(goalCost({ ...base, financing: { kind: 'cash' } })).toEqual({
      upfrontCents: 360_000,
      installmentCents: 0,
      installments: 0,
      totalCents: 360_000,
    });
  });
});
