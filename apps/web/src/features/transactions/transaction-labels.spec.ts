import type { TransactionDto } from '@finapp/contracts';
import { describe, expect, it } from 'vitest';
import { aTransaction } from '../../../test/finance-fixtures';
import { explain, paymentBadge } from './transaction-labels';

const t = (overrides: Partial<TransactionDto>) => aTransaction(overrides);

describe('paymentBadge', () => {
  it('names the way the money moved', () => {
    expect(paymentBadge(t({ paymentMethod: 'pix' }))?.label).toBe('Pix');
    expect(paymentBadge(t({ paymentMethod: 'card_purchase' }))?.label).toBe('À vista');
    expect(paymentBadge(t({ paymentMethod: 'other' }))).toBeUndefined();
    expect(
      paymentBadge(
        t({
          paymentMethod: 'card_purchase',
          installment: {
            number: 3,
            total: 10,
            totalAmount: { cents: -100000, currency: 'BRL' },
            totalAmountIsEstimated: false,
          },
        }),
      )?.label,
    ).toBe('Parcela 3/10');
  });

  it('transfers between own accounts and bill payments win over the method', () => {
    expect(paymentBadge(t({ paymentMethod: 'pix', classification: 'internal_transfer' }))).toEqual({
      label: 'Entre contas',
      tone: 'transfer',
    });
    expect(paymentBadge(t({ paymentMethod: 'bill_payment', classification: 'internal_transfer' }))?.label).toBe(
      'Fatura',
    );
  });
});

describe('refunds', () => {
  it('money back from a spending gets its own badge and explanation', () => {
    const refund = t({ amount: { cents: 1800, currency: 'BRL' }, classification: 'expense', paymentMethod: 'pix' });
    expect(paymentBadge(refund)).toEqual({ label: 'Devolução', tone: 'income' });
    expect(explain(refund)[1]).toMatch(/^Devolução: o dinheiro voltou/);
  });
});

describe('explain', () => {
  it('says where the category and the classification came from', () => {
    expect(explain(t({ category: { id: 'x', source: 'rule' } }))).toContain('Categoria definida por uma regra sua.');
    expect(explain(t({ category: { id: 'x', source: 'learned' } }))[0]).toMatch(/aprendida com uma correção sua/);
    expect(
      explain(t({ classification: 'internal_transfer', classificationSource: 'matcher', paymentMethod: 'pix' }))[1],
    ).toMatch(/de uma conta sua e entrou em outra sua/);
    expect(explain(t({ classification: 'ignored', classificationSource: 'manual' }))[1]).toBe(
      'Classificada por você como "ignorada nos relatórios".',
    );
  });

  it('warns about pending values and estimated installment totals', () => {
    const reasons = explain(
      t({
        status: 'pending',
        installment: {
          number: 1,
          total: 3,
          totalAmount: { cents: -30000, currency: 'BRL' },
          totalAmountIsEstimated: true,
        },
      }),
    );
    expect(reasons.some((r) => r.includes('estimado'))).toBe(true);
    expect(reasons.some((r) => r.includes('pendente'))).toBe(true);
  });
});
