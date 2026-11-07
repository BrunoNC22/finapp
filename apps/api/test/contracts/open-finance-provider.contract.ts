import { beforeEach, describe, expect, it } from 'vitest';
import type { OpenFinanceProvider } from '../../src/modules/ledger/application/ports/open-finance-provider.js';
import { Transaction } from '../../src/modules/ledger/domain/transaction.js';
import { Document } from '../../src/shared/kernel/document.js';
import type { LocalDate } from '../../src/shared/kernel/local-date.js';

/**
 * Comportamento que TODO adapter de OpenFinanceProvider deve ter (ADR 0005).
 * `range` é o período usado nas consultas de transações.
 */
export function openFinanceProviderContract(
  name: string,
  makeProvider: () => Promise<OpenFinanceProvider>,
  range: { from: LocalDate; to: LocalDate },
) {
  describe(`OpenFinanceProvider contract: ${name}`, () => {
    let provider: OpenFinanceProvider;
    beforeEach(async () => {
      provider = await makeProvider();
    });

    const allAccounts = async () =>
      (await Promise.all((await provider.listConnections()).map((c) => provider.listAccounts(c.id)))).flat();

    it('lists connections and their accounts, with a parseable holder document', async () => {
      const connections = await provider.listConnections();
      expect(connections.length).toBeGreaterThan(0);
      for (const connection of connections) {
        for (const account of await provider.listAccounts(connection.id)) {
          expect(account.connectionId).toBe(connection.id);
          expect(() => Document.parse(account.holderDocument)).not.toThrow();
        }
      }
    });

    it('returns only transactions of the requested account and period, with unique external ids', async () => {
      for (const account of await allAccounts()) {
        const txs = await provider.listTransactions(account.externalId, range);
        expect(txs.every((t) => t.accountExternalId === account.externalId)).toBe(true);
        expect(txs.every((t) => !t.occurredOn.isBefore(range.from) && !t.occurredOn.isAfter(range.to))).toBe(true);
        expect(new Set(txs.map((t) => t.externalId)).size).toBe(txs.length);
      }
    });

    it('delivers transactions the domain accepts (installments only on credit cards)', async () => {
      for (const account of await allAccounts()) {
        for (const t of await provider.listTransactions(account.externalId, range)) {
          if (t.installment) expect(account.kind).toBe('credit_card');
          expect(() =>
            Transaction.record({
              id: t.externalId,
              accountId: account.externalId,
              externalId: t.externalId,
              occurredOn: t.occurredOn,
              amount: t.amount,
              description: t.description,
              paymentMethod: t.paymentMethod,
              status: t.status,
            }),
          ).not.toThrow();
        }
      }
    });

    it('is stable: the same query returns the same data', async () => {
      const [account] = await allAccounts();
      if (!account) return;
      const first = await provider.listTransactions(account.externalId, range);
      const second = await provider.listTransactions(account.externalId, range);
      expect(second.map((t) => [t.externalId, t.amount.cents])).toEqual(
        first.map((t) => [t.externalId, t.amount.cents]),
      );
    });
  });
}
