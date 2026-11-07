import {
  type TransactionPeriodQuery,
  TransactionRepository,
} from '../../src/modules/ledger/application/ports/transaction-repository.js';
import { Transaction } from '../../src/modules/ledger/domain/transaction.js';
import { LocalDate } from '../../src/shared/kernel/local-date.js';

type Snapshot = ReturnType<Transaction['snapshot']>;

/**
 * Fake em memória. Guarda SNAPSHOTS e devolve cópias: alterar uma entidade sem `save`
 * não muda o "banco", exatamente como acontece com um banco de verdade.
 */
export class InMemoryTransactionRepository extends TransactionRepository {
  private readonly rows = new Map<string, Snapshot>();

  async save(transaction: Transaction): Promise<void> {
    this.rows.set(transaction.id, structuredCloneSnapshot(transaction.snapshot()));
  }

  async saveMany(transactions: readonly Transaction[]): Promise<void> {
    for (const transaction of transactions) await this.save(transaction);
  }

  async findById(id: string): Promise<Transaction | undefined> {
    const row = this.rows.get(id);
    return row ? restore(row) : undefined;
  }

  async findByExternalId(accountId: string, externalId: string): Promise<Transaction | undefined> {
    const row = [...this.rows.values()].find(
      (r) => r.props.accountId === accountId && r.props.externalId === externalId,
    );
    return row ? restore(row) : undefined;
  }

  async findInPeriod(query: TransactionPeriodQuery): Promise<Transaction[]> {
    return [...this.rows.values()]
      .filter((r) => !r.props.occurredOn.isBefore(query.from) && !r.props.occurredOn.isAfter(query.to))
      .filter((r) => !query.accountIds || query.accountIds.includes(r.props.accountId))
      .sort((a, b) => LocalDate.compare(a.props.occurredOn, b.props.occurredOn))
      .map(restore);
  }

  /** Inspeção para testes. */
  get size(): number {
    return this.rows.size;
  }
}

/** Cópia rasa dos registros: value objects são imutáveis e podem ser compartilhados. */
function structuredCloneSnapshot(snapshot: Snapshot): Snapshot {
  return { props: { ...snapshot.props }, state: { ...snapshot.state } };
}

function restore(row: Snapshot): Transaction {
  const copy = structuredCloneSnapshot(row);
  return Transaction.restore(copy.props, copy.state);
}
