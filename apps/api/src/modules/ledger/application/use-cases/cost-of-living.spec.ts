import { describe, expect, it } from 'vitest';
import { anAccount } from '../../../../../test/builders/account.builder.js';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import { InMemoryAccountRepository } from '../../../../../test/doubles/in-memory-account-repository.js';
import { InMemoryTransactionRepository } from '../../../../../test/doubles/in-memory-transaction-repository.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { GetAvailableBalance, GetCostOfLiving } from './cost-of-living.js';

describe('GetCostOfLiving', () => {
  it('averages real monthly spending per category, refunds discounted, transfers and income ignored', async () => {
    const transactions = new InMemoryTransactionRepository();
    const tx = (id: string, day: string, cents: number, category?: string) => {
      const t = aTransaction().withId(id).on(day).withAmount(cents).withPaymentMethod('pix').build();
      if (category) t.categorize(category, 'manual');
      return t;
    };
    const ride = tx('r1', '2026-09-10', -3000, 'transporte.app');
    const refund = tx('r2', '2026-09-11', 1000, 'transporte.app-devolucao');
    refund.markAsRefund();
    const own = tx('own', '2026-10-01', -50000);
    own.markAsInternalTransfer();
    await transactions.saveMany([
      ride,
      refund,
      tx('m1', '2026-10-05', -9000, 'alimentacao.mercado'),
      tx('x', '2026-10-06', -1000),
      own,
      tx('in', '2026-10-07', 100000),
    ]);

    const cost = await new GetCostOfLiving(transactions).execute(
      LocalDate.parse('2026-09-01'),
      LocalDate.parse('2026-10-31'),
      2,
    );

    expect(cost.monthlySpending.cents).toBe((3000 - 1000 + 9000 + 1000) / 2);
    expect(cost.byCategory.get('transporte.app')?.cents).toBe(1500);
    expect(cost.byCategory.get('transporte.app-devolucao')?.cents).toBe(-500);
    expect(cost.byCategory.get('sem-categoria')?.cents).toBe(500);
  });
});

describe('GetAvailableBalance', () => {
  it('adds positive balances of accounts that are not credit cards', async () => {
    const accounts = new InMemoryAccountRepository();
    const withBalance = (id: string, cents: number, kind: 'checking' | 'credit_card' = 'checking') => {
      const a = anAccount().withId(id).withKind(kind).build();
      a.recordBalance(Money.fromCents(cents), new Date());
      return a;
    };
    await accounts.save(withBalance('a', 50000));
    await accounts.save(withBalance('b', -2000));
    await accounts.save(withBalance('card', 90000, 'credit_card'));
    expect((await new GetAvailableBalance(accounts).execute()).cents).toBe(50000);
  });
});
