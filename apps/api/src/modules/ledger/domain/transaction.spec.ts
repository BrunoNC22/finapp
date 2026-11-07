import { describe, expect, it } from 'vitest';
import { aTransaction } from '../../../../test/builders/transaction.builder.js';
import { Money } from '../../../shared/kernel/money.js';
import { Installment } from './installment.js';
import { InvalidTransactionError } from './transaction.js';

describe('Transaction', () => {
  describe('sign convention: negative = money leaving the user', () => {
    it('knows its direction', () => {
      expect(aTransaction().withAmount(-1000).build().direction).toBe('outflow');
      expect(aTransaction().withAmount(1000).build().direction).toBe('inflow');
      expect(aTransaction().withAmount(0).build().direction).toBe('none');
    });
  });

  describe('default classification', () => {
    it('outflows are expenses and inflows are income', () => {
      expect(aTransaction().withAmount(-1000).build().classification).toBe('expense');
      expect(aTransaction().withAmount(1000).build().classification).toBe('income');
    });

    it('credit card bill payments are internal transfers on both sides', () => {
      expect(aTransaction().withAmount(-50000).withPaymentMethod('bill_payment').build().classification).toBe(
        'internal_transfer',
      );
      expect(aTransaction().withAmount(50000).withPaymentMethod('bill_payment').build().classification).toBe(
        'internal_transfer',
      );
    });

    it('refunds reduce spending instead of counting as income', () => {
      expect(aTransaction().withAmount(2500).withPaymentMethod('refund').build().classification).toBe('expense');
    });

    it('yield and cashback are income', () => {
      expect(aTransaction().withAmount(12).withPaymentMethod('yield').build().classification).toBe('income');
      expect(aTransaction().withAmount(80).withPaymentMethod('cashback').build().classification).toBe('income');
    });

    it('starts with source "default"', () => {
      expect(aTransaction().build().classificationSource).toBe('default');
    });
  });

  describe('internal transfers', () => {
    it('links two sides of a transfer between the user accounts', () => {
      const out = aTransaction().withAccount('acc-a').withAmount(-30000).withPaymentMethod('pix').build();
      const into = aTransaction().withAccount('acc-b').withAmount(30000).withPaymentMethod('pix').build();

      expect(out.markAsInternalTransfer(into.id)).toBe(true);
      expect(out.classification).toBe('internal_transfer');
      expect(out.transferLink).toBe(into.id);
      expect(out.classificationSource).toBe('matcher');
    });

    it('can be an unpaired transfer to an own account that is not tracked', () => {
      const out = aTransaction().withAmount(-30000).build();
      out.markAsInternalTransfer();
      expect(out.classification).toBe('internal_transfer');
      expect(out.transferLink).toBeUndefined();
    });

    it('never overrides a classification made manually by the user', () => {
      const tx = aTransaction().withAmount(-30000).build();
      tx.classifyManually('expense');

      expect(tx.markAsInternalTransfer('other-id')).toBe(false);
      expect(tx.classification).toBe('expense');
      expect(tx.classificationSource).toBe('manual');
    });

    it('cannot link a transaction to itself', () => {
      const tx = aTransaction().build();
      expect(() => tx.markAsInternalTransfer(tx.id)).toThrow(InvalidTransactionError);
    });

    it('unlinking manually restores an explicit classification', () => {
      const tx = aTransaction().withAmount(-30000).build();
      tx.markAsInternalTransfer('other-id');
      tx.classifyManually('expense');
      expect(tx.classification).toBe('expense');
      expect(tx.transferLink).toBeUndefined();
    });
  });

  describe('categorization', () => {
    it('accepts a category from the provider or from a rule', () => {
      const tx = aTransaction().build();
      expect(tx.categorize('cat-groceries', 'provider')).toBe(true);
      expect(tx.category).toEqual({ categoryId: 'cat-groceries', source: 'provider' });
      expect(tx.categorize('cat-market', 'rule')).toBe(true);
      expect(tx.category?.categoryId).toBe('cat-market');
    });

    it('a rule never overrides a manual category, and the provider never overrides a rule', () => {
      const tx = aTransaction().build();
      tx.categorize('cat-rent', 'manual');
      expect(tx.categorize('cat-other', 'rule')).toBe(false);
      expect(tx.categorize('cat-other', 'provider')).toBe(false);
      expect(tx.category?.categoryId).toBe('cat-rent');

      const ruled = aTransaction().build();
      ruled.categorize('cat-market', 'rule');
      expect(ruled.categorize('cat-provider', 'provider')).toBe(false);
    });

    it('the user can always recategorize manually', () => {
      const tx = aTransaction().build();
      tx.categorize('cat-rent', 'manual');
      expect(tx.categorize('cat-utilities', 'manual')).toBe(true);
      expect(tx.category?.categoryId).toBe('cat-utilities');
    });
  });

  describe('card installments', () => {
    it('is a card purchase with installment information', () => {
      const tx = aTransaction()
        .withAmount(-3334)
        .withPaymentMethod('card_purchase')
        .withInstallment(Installment.of({ number: 1, total: 3, installmentAmount: Money.fromCents(3334) }))
        .build();
      expect(tx.isInstallment).toBe(true);
      expect(tx.installment?.label).toBe('1/3');
    });

    it('only card purchases can carry installments', () => {
      expect(() =>
        aTransaction()
          .withPaymentMethod('pix')
          .withInstallment(Installment.of({ number: 1, total: 2, installmentAmount: Money.fromCents(100) }))
          .build(),
      ).toThrow(InvalidTransactionError);
    });
  });

  describe('invariants', () => {
    it('requires an account, an external id and a description', () => {
      expect(() => aTransaction().withAccount('').build()).toThrow(InvalidTransactionError);
      expect(() => aTransaction().withExternalId('').build()).toThrow(InvalidTransactionError);
      expect(() => aTransaction().withDescription('  ').build()).toThrow(InvalidTransactionError);
    });
  });
});
