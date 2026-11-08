import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

export interface CostOfLiving {
  /** Gasto médio mensal real (gastos menos devoluções; sem transferências entre contas). */
  readonly monthlySpending: Money;
  /** Média mensal por categoria ('sem-categoria' para o que não tem). */
  readonly byCategory: ReadonlyMap<string, Money>;
  readonly months: number;
}

/** Custo de vida atual, exposto a outros módulos (planejamento) sem as entidades do ledger. */
export class GetCostOfLiving {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(from: LocalDate, to: LocalDate, months: number): Promise<CostOfLiving> {
    const totals = new Map<string, number>();
    for (const t of await this.transactions.findInPeriod({ from, to })) {
      if (t.classification !== 'expense') continue;
      const key = t.category?.categoryId ?? 'sem-categoria';
      totals.set(key, (totals.get(key) ?? 0) - t.amount.cents);
    }
    const byCategory = new Map([...totals].map(([k, cents]) => [k, Money.fromCents(Math.round(cents / months))]));
    const total = [...totals.values()].reduce((a, b) => a + b, 0);
    return { monthlySpending: Money.fromCents(Math.round(total / months)), byCategory, months };
  }
}

/** Dinheiro disponível hoje: saldos positivos das contas que não são cartão. */
export class GetAvailableBalance {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(): Promise<Money> {
    return Money.sum(
      (await this.accounts.findAll())
        .filter((a) => !a.isCreditCard && a.currentBalance.isPositive())
        .map((a) => a.currentBalance),
    );
  }
}
