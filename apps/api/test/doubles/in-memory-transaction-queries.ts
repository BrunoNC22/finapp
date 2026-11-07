import {
  type TransactionCursor,
  type TransactionFilter,
  TransactionQueries,
  type TransactionSearchResult,
} from '../../src/modules/ledger/application/ports/transaction-queries.js';
import { foldText } from '../../src/modules/ledger/domain/categorization/categorization-rule.js';
import { LocalDate } from '../../src/shared/kernel/local-date.js';
import type { InMemoryTransactionRepository } from './in-memory-transaction-repository.js';

/** Fake do modelo de leitura sobre o repositório em memória. */
export class InMemoryTransactionQueries extends TransactionQueries {
  constructor(private readonly repository: InMemoryTransactionRepository) {
    super();
  }

  async search(
    filter: TransactionFilter,
    page: { cursor?: TransactionCursor; limit: number },
  ): Promise<TransactionSearchResult> {
    const all = await this.repository.findInPeriod({
      from: filter.from ?? LocalDate.parse('1900-01-01'),
      to: filter.to ?? LocalDate.parse('2999-12-31'),
    });
    const key = (t: { occurredOn: LocalDate; id: string }) => `${t.occurredOn.toString()}|${t.id}`;
    const matching = all
      .filter((t) => !filter.accountId || t.accountId === filter.accountId)
      .filter((t) => !filter.categoryId || t.category?.categoryId === filter.categoryId)
      .filter((t) => !filter.classification || t.classification === filter.classification)
      .filter((t) => !filter.paymentMethod || t.paymentMethod === filter.paymentMethod)
      .filter((t) => !filter.text || foldText(t.description).includes(foldText(filter.text)))
      .filter(
        (t) =>
          !filter.uncategorized || (!t.category && (t.classification === 'income' || t.classification === 'expense')),
      )
      .sort((a, b) => key(b).localeCompare(key(a)))
      .filter((t) => !page.cursor || key(t) < `${page.cursor.occurredOn}|${page.cursor.id}`);
    const items = matching.slice(0, page.limit);
    const last = items.at(-1);
    return matching.length > page.limit && last
      ? { items, next: { occurredOn: last.occurredOn.toString(), id: last.id } }
      : { items };
  }
}
