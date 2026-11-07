import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { Transaction } from '../../domain/transaction.js';

export interface TransactionPeriodQuery {
  /** Datas inclusivas. */
  readonly from: LocalDate;
  readonly to: LocalDate;
  /** Sem filtro de conta quando omitido. */
  readonly accountIds?: readonly string[];
}

/** Porta de persistência de transações. */
export abstract class TransactionRepository {
  /** Insere ou substitui pela identidade (`id`). */
  abstract save(transaction: Transaction): Promise<void>;
  abstract saveMany(transactions: readonly Transaction[]): Promise<void>;
  abstract findById(id: string): Promise<Transaction | undefined>;
  abstract findByExternalId(accountId: string, externalId: string): Promise<Transaction | undefined>;
  /** Ordenadas por data (mais antigas primeiro). */
  abstract findInPeriod(query: TransactionPeriodQuery): Promise<Transaction[]>;
}
