import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { Money } from '../../../../shared/kernel/money.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

/** Entrada REAL de dinheiro, exposta a outros módulos (ex.: planejamento) sem a entidade do ledger. */
export interface IncomeEntry {
  readonly id: string;
  readonly occurredOn: LocalDate;
  readonly amount: Money;
  readonly accountId: string;
  readonly description: string;
  readonly counterpartyName?: string;
  readonly categoryId?: string;
}

/**
 * Renda do período: só transações classificadas como renda (transferências entre contas próprias e
 * devoluções nunca entram). Fachada do ledger para os outros módulos.
 */
export class ListIncomeEntries {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(from: LocalDate, to: LocalDate): Promise<IncomeEntry[]> {
    return (await this.transactions.findInPeriod({ from, to }))
      .filter((t) => t.classification === 'income' && t.amount.isPositive())
      .map((t) => ({
        id: t.id,
        occurredOn: t.occurredOn,
        amount: t.amount,
        accountId: t.accountId,
        description: t.description,
        ...(t.counterparty?.name ? { counterpartyName: t.counterparty.name } : {}),
        ...(t.category ? { categoryId: t.category.categoryId } : {}),
      }));
  }
}
