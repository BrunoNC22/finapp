import { describe, expect, it } from 'vitest';
import { LocalDate } from '../../../shared/kernel/local-date.js';
import { Money } from '../../../shared/kernel/money.js';
import { Installment, InvalidInstallmentError } from './installment.js';

describe('Installment', () => {
  it('describes the k-th of n installments of a purchase', () => {
    const installment = Installment.of({ number: 2, total: 6, totalAmount: Money.fromCents(60000) });
    expect(installment.number).toBe(2);
    expect(installment.total).toBe(6);
    expect(installment.remaining).toBe(4);
    expect(installment.isLast).toBe(false);
    expect(installment.label).toBe('2/6');
  });

  it('estimates the purchase total from the installment value when the provider does not send it', () => {
    const installment = Installment.of({ number: 1, total: 3, installmentAmount: Money.fromCents(3334) });
    expect(installment.totalAmount.cents).toBe(10002);
    expect(installment.totalAmountIsEstimated).toBe(true);
  });

  it('keeps the provider total when it is informed', () => {
    const installment = Installment.of({ number: 1, total: 3, totalAmount: Money.fromCents(10000) });
    expect(installment.totalAmountIsEstimated).toBe(false);
  });

  it('keeps the original purchase date when known', () => {
    const purchaseDate = LocalDate.parse('2026-05-10');
    expect(Installment.of({ number: 1, total: 2, totalAmount: Money.fromCents(100), purchaseDate }).purchaseDate).toBe(
      purchaseDate,
    );
  });

  it('rejects inconsistent numbering', () => {
    const totalAmount = Money.fromCents(100);
    expect(() => Installment.of({ number: 0, total: 3, totalAmount })).toThrow(InvalidInstallmentError);
    expect(() => Installment.of({ number: 4, total: 3, totalAmount })).toThrow(InvalidInstallmentError);
    expect(() => Installment.of({ number: 1, total: 1, totalAmount })).toThrow(InvalidInstallmentError);
    expect(() => Installment.of({ number: 1.5, total: 3, totalAmount })).toThrow(InvalidInstallmentError);
  });

  it('requires either the total or the installment amount', () => {
    expect(() => Installment.of({ number: 1, total: 3 })).toThrow(InvalidInstallmentError);
  });

  it('stores the purchase total as a positive amount', () => {
    const installment = Installment.of({ number: 1, total: 2, installmentAmount: Money.fromCents(-500) });
    expect(installment.totalAmount.cents).toBe(1000);
  });
});
