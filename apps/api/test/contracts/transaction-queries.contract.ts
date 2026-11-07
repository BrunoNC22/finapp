import { beforeEach, describe, expect, it } from 'vitest';
import type {
  TransactionCursor,
  TransactionQueries,
} from '../../src/modules/ledger/application/ports/transaction-queries.js';
import type { TransactionRepository } from '../../src/modules/ledger/application/ports/transaction-repository.js';
import { LocalDate } from '../../src/shared/kernel/local-date.js';
import { aTransaction } from '../builders/transaction.builder.js';

/** Comportamento de TODO modelo de leitura de transações. */
export function transactionQueriesContract(
  name: string,
  make: () => Promise<{ repository: TransactionRepository; queries: TransactionQueries }>,
) {
  describe(`TransactionQueries contract: ${name}`, () => {
    let queries: TransactionQueries;
    beforeEach(async () => {
      const env = await make();
      queries = env.queries;
      const groceries = aTransaction()
        .withId('t1')
        .withAccount('a')
        .on('2026-10-01')
        .withDescription('FARMÁCIA CENTRAL')
        .withPaymentMethod('card_purchase')
        .build();
      groceries.categorize('saude.farmacia', 'provider');
      const pix = aTransaction()
        .withId('t2')
        .withAccount('b')
        .on('2026-10-02')
        .withDescription('Pix enviado')
        .withPaymentMethod('pix')
        .build();
      const income = aTransaction()
        .withId('t3')
        .withAccount('a')
        .on('2026-10-03')
        .withAmount(5000)
        .withDescription('Salário')
        .withPaymentMethod('other')
        .build();
      const transfer = aTransaction()
        .withId('t4')
        .withAccount('a')
        .on('2026-10-03')
        .withPaymentMethod('bill_payment')
        .withDescription('Pagamento fatura')
        .build();
      const old = aTransaction().withId('t5').withAccount('a').on('2026-09-15').withDescription('Mercado').build();
      await env.repository.saveMany([groceries, pix, income, transfer, old]);
    });

    const ids = async (filter: Parameters<TransactionQueries['search']>[0], limit = 50) =>
      (await queries.search(filter, { limit })).items.map((t) => t.id);

    it('orders by date (newest first), then id', async () => {
      expect(await ids({})).toEqual(['t4', 't3', 't2', 't1', 't5']);
    });

    it('filters by period, account, category, classification and payment method', async () => {
      expect(await ids({ from: LocalDate.parse('2026-10-01'), to: LocalDate.parse('2026-10-02') })).toEqual([
        't2',
        't1',
      ]);
      expect(await ids({ accountId: 'b' })).toEqual(['t2']);
      expect(await ids({ categoryId: 'saude.farmacia' })).toEqual(['t1']);
      expect(await ids({ classification: 'income' })).toEqual(['t3']);
      expect(await ids({ paymentMethod: 'pix' })).toEqual(['t2']);
    });

    it('searches the description ignoring accents and case', async () => {
      expect(await ids({ text: 'farmacia' })).toEqual(['t1']);
      expect(await ids({ text: 'SALÁRIO' })).toEqual(['t3']);
    });

    it('finds income and expenses that still have no category (transfers are not "uncategorized")', async () => {
      expect(await ids({ uncategorized: true })).toEqual(['t3', 't2', 't5']);
    });

    it('paginates with a cursor without repeating or skipping items', async () => {
      const seen: string[] = [];
      let cursor: TransactionCursor | undefined;
      do {
        const page = await queries.search({}, { limit: 2, ...(cursor ? { cursor } : {}) });
        seen.push(...page.items.map((t) => t.id));
        cursor = page.next;
      } while (cursor);
      expect(seen).toEqual(['t4', 't3', 't2', 't1', 't5']);
    });
  });
}
