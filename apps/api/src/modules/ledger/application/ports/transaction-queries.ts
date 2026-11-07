import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { Classification, PaymentMethod, Transaction } from '../../domain/transaction.js';

export interface TransactionFilter {
  readonly from?: LocalDate;
  readonly to?: LocalDate;
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly classification?: Classification;
  readonly paymentMethod?: PaymentMethod;
  /** Trecho da descrição; comparação sem acento e sem diferenciar maiúsculas. */
  readonly text?: string;
  /** Só renda/gasto ainda sem categoria. */
  readonly uncategorized?: boolean;
}

/** Posição na listagem (ordem: data decrescente, depois id decrescente). */
export interface TransactionCursor {
  readonly occurredOn: string;
  readonly id: string;
}

export interface TransactionSearchResult {
  readonly items: Transaction[];
  readonly next?: TransactionCursor;
}

/** Porta de leitura (consultas paginadas), separada da porta de persistência. */
export abstract class TransactionQueries {
  abstract search(
    filter: TransactionFilter,
    page: { cursor?: TransactionCursor; limit: number },
  ): Promise<TransactionSearchResult>;
}
