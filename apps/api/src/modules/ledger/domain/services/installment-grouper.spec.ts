import { describe, expect, it } from 'vitest';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { Installment } from '../installment.js';
import type { Transaction } from '../transaction.js';
import { InstallmentGrouper, normalizeMerchant } from './installment-grouper.js';

interface Parcel {
  readonly n: number;
  readonly of: number;
  readonly cents: number;
  readonly day: string;
  readonly merchant?: string;
  readonly account?: string;
  readonly purchase?: string;
  readonly total?: number;
}

let seq = 0;
const parcel = (p: Parcel): Transaction =>
  aTransaction()
    .withId(`p-${++seq}`)
    .withAccount(p.account ?? 'card')
    .withDescription(p.merchant ?? 'LOJA EXEMPLO')
    .withAmount(-p.cents)
    .on(p.day)
    .withPaymentMethod('card_purchase')
    .withInstallment(
      Installment.of({
        number: p.n,
        total: p.of,
        ...(p.total ? { totalAmount: Money.fromCents(p.total) } : { installmentAmount: Money.fromCents(p.cents) }),
        ...(p.purchase ? { purchaseDate: LocalDate.parse(p.purchase) } : {}),
      }),
    )
    .build();

const group = (txs: Transaction[]) => new InstallmentGrouper().group(txs);

describe('normalizeMerchant', () => {
  it('ignores case, accents, card suffixes and installment markers', () => {
    expect(normalizeMerchant('LOJA EXEMPLO*123')).toBe(normalizeMerchant('Loja Exemplo'));
    expect(normalizeMerchant('Lója Exemplo PARC 02/06')).toBe('loja exemplo');
    expect(normalizeMerchant('LOJA   EXEMPLO       CIDADE X BRA')).toBe('loja exemplo cidade x bra');
  });
});

describe('InstallmentGrouper', () => {
  it('groups the installments of one purchase and knows what is left', () => {
    const [purchase] = group([
      parcel({ n: 1, of: 3, cents: 3334, day: '2026-01-10', purchase: '2026-01-10' }),
      parcel({ n: 2, of: 3, cents: 3334, day: '2026-02-10' }),
    ]);

    expect(purchase?.total).toBe(3);
    expect(purchase?.knownNumbers).toEqual([1, 2]);
    expect(purchase?.remainingCount).toBe(1);
    expect(purchase?.purchaseDate?.toString()).toBe('2026-01-10');
    expect(purchase?.totalAmount.cents).toBe(10002);
    expect(purchase?.totalAmountIsEstimated).toBe(true);
  });

  it('treats different amounts at the same merchant as different purchases', () => {
    expect(
      group([
        parcel({ n: 1, of: 3, cents: 5000, day: '2026-01-10' }),
        parcel({ n: 1, of: 3, cents: 7000, day: '2026-01-12' }),
      ]),
    ).toHaveLength(2);
  });

  it('tolerates description variations of the same merchant', () => {
    expect(
      group([
        parcel({ n: 1, of: 2, cents: 5000, day: '2026-01-10', merchant: 'LOJA EXEMPLO*987' }),
        parcel({ n: 2, of: 2, cents: 5000, day: '2026-02-10', merchant: 'LOJA EXEMPLO' }),
      ]),
    ).toHaveLength(1);
  });

  it('accepts installments of the same purchase differing by a few cents (division remainder, seen in real data)', () => {
    const purchases = group([
      parcel({ n: 1, of: 2, cents: 5001, day: '2026-08-10' }),
      parcel({ n: 2, of: 2, cents: 5000, day: '2026-09-10' }),
    ]);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.remainingCount).toBe(0);
  });

  it('still separates purchases whose installment values clearly differ', () => {
    expect(
      group([
        parcel({ n: 1, of: 2, cents: 5000, day: '2026-08-10' }),
        parcel({ n: 2, of: 2, cents: 5100, day: '2026-09-10' }),
      ]),
    ).toHaveLength(2);
  });

  it('separates identical purchases made in different months', () => {
    const purchases = group([
      parcel({ n: 1, of: 3, cents: 5000, day: '2026-01-10' }),
      parcel({ n: 2, of: 3, cents: 5000, day: '2026-02-10' }),
      parcel({ n: 1, of: 3, cents: 5000, day: '2026-02-11' }),
    ]);
    expect(purchases).toHaveLength(2);
    expect(purchases.map((p) => p.knownNumbers)).toEqual(expect.arrayContaining([[1, 2], [1]]));
  });

  it('separates identical purchases made in the same month (repeated installment numbers)', () => {
    const purchases = group([
      parcel({ n: 1, of: 2, cents: 5000, day: '2026-01-10' }),
      parcel({ n: 1, of: 2, cents: 5000, day: '2026-01-10' }),
      parcel({ n: 2, of: 2, cents: 5000, day: '2026-02-10' }),
    ]);
    expect(purchases).toHaveLength(2);
    expect(purchases.map((p) => p.knownNumbers.length).sort()).toEqual([1, 2]);
  });

  it('keeps a purchase with a missing installment in the middle', () => {
    const [purchase, ...rest] = group([
      parcel({ n: 1, of: 3, cents: 5000, day: '2026-01-10' }),
      parcel({ n: 3, of: 3, cents: 5000, day: '2026-03-10' }),
    ]);
    expect(rest).toHaveLength(0);
    expect(purchase?.remainingCount).toBe(0);
  });

  it('handles purchases that started before the available history', () => {
    const [purchase] = group([parcel({ n: 4, of: 10, cents: 2000, day: '2026-01-10' })]);
    expect(purchase?.knownNumbers).toEqual([4]);
    expect(purchase?.remainingCount).toBe(6);
    expect(purchase?.firstInstallmentMonth).toBe('2025-10');
  });

  it('separates purchases from different cards', () => {
    expect(
      group([
        parcel({ n: 1, of: 2, cents: 5000, day: '2026-01-10', account: 'card-a' }),
        parcel({ n: 1, of: 2, cents: 5000, day: '2026-01-10', account: 'card-b' }),
      ]),
    ).toHaveLength(2);
  });

  it('ignores transactions that are not installments', () => {
    expect(group([aTransaction().withPaymentMethod('card_purchase').build()])).toHaveLength(0);
  });

  describe('projection of future commitments', () => {
    it('projects the remaining installments month by month after the last known one', () => {
      const [purchase] = group([
        parcel({ n: 1, of: 4, cents: 2500, day: '2026-01-10' }),
        parcel({ n: 2, of: 4, cents: 2500, day: '2026-02-10' }),
      ]);
      expect(purchase?.projectRemaining().map((i) => [i.number, i.expectedMonth, i.amount.cents])).toEqual([
        [3, '2026-03', 2500],
        [4, '2026-04', 2500],
      ]);
    });

    it('uses exact cents when the provider informs the purchase total', () => {
      const [purchase] = group([parcel({ n: 1, of: 3, cents: 3334, day: '2026-01-10', total: 10000 })]);
      expect(purchase?.projectRemaining().map((i) => i.amount.cents)).toEqual([3333, 3333]);
    });

    it('sums commitments per month across purchases for the next N months', () => {
      const grouper = new InstallmentGrouper();
      const purchases = grouper.group([
        parcel({ n: 1, of: 3, cents: 1000, day: '2026-01-05', merchant: 'LOJA A' }),
        parcel({ n: 1, of: 2, cents: 3000, day: '2026-01-20', merchant: 'LOJA B' }),
      ]);

      const commitments = grouper.commitments(purchases, LocalDate.parse('2026-02-01'), 3);

      expect(commitments.map((c) => [c.month, c.amount.cents])).toEqual([
        ['2026-02', 4000],
        ['2026-03', 1000],
        ['2026-04', 0],
      ]);
    });
  });
});
