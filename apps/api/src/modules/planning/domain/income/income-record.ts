import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { Money } from '../../../../shared/kernel/money.js';

/**
 * Uma entrada REAL de dinheiro (renda: sem transferências entre contas próprias e sem devoluções),
 * como o planejamento a enxerga. Vem do módulo ledger, pela camada de aplicação dele.
 */
export interface IncomeRecord {
  readonly id: string;
  readonly occurredOn: LocalDate;
  readonly amount: Money;
  readonly accountId: string;
  readonly description: string;
  readonly counterpartyName?: string;
  readonly categoryId?: string;
}
