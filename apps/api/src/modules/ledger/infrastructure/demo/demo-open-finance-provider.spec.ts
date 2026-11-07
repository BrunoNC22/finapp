import { describe, expect, it } from 'vitest';
import { openFinanceProviderContract } from '../../../../../test/contracts/open-finance-provider.contract.js';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import { Document } from '../../../../shared/kernel/document.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Account } from '../../domain/account.js';
import { DEFAULT_CATEGORIES } from '../../domain/categorization/default-taxonomy.js';
import { Installment } from '../../domain/installment.js';
import { InstallmentGrouper } from '../../domain/services/installment-grouper.js';
import { InternalTransferMatcher } from '../../domain/services/internal-transfer-matcher.js';
import { Transaction } from '../../domain/transaction.js';
import { DemoOpenFinanceProvider } from './demo-open-finance-provider.js';

const TODAY = new Date('2026-11-07T15:00:00Z');
const make = () => new DemoOpenFinanceProvider(new FixedClock(TODAY));
const lastYear = { from: LocalDate.parse('2025-11-01'), to: LocalDate.parse('2026-11-07') };

openFinanceProviderContract('demo', async () => make(), lastYear);

async function loadEverything() {
  const provider = make();
  const accounts: Account[] = [];
  const transactions: Transaction[] = [];
  for (const connection of await provider.listConnections()) {
    for (const a of await provider.listAccounts(connection.id)) {
      accounts.push(
        Account.create({
          id: a.externalId,
          externalId: a.externalId,
          institutionName: a.institutionName,
          kind: a.kind,
          holderDocument: Document.parse(a.holderDocument),
        }),
      );
      for (const t of await provider.listTransactions(a.externalId, lastYear)) {
        transactions.push(
          Transaction.record({
            id: t.externalId,
            accountId: a.externalId,
            externalId: t.externalId,
            occurredOn: t.occurredOn,
            amount: t.amount,
            description: t.description,
            paymentMethod: t.paymentMethod,
            status: t.status,
            ...(t.counterparty?.document
              ? { counterparty: { document: Document.parse(t.counterparty.document) } }
              : {}),
            ...(t.providerCategoryId ? { providerCategoryId: t.providerCategoryId } : {}),
          }),
        );
      }
    }
  }
  return { provider, accounts, transactions };
}

describe('DemoOpenFinanceProvider', () => {
  it('models a fictitious person with a business account, wallets, a bank account and a credit card', async () => {
    const { accounts } = await loadEverything();
    expect(accounts.map((a) => a.kind).sort()).toEqual([
      'checking',
      'checking',
      'checking',
      'credit_card',
      'payment_account',
    ]);
    expect(accounts.filter((a) => a.holderType === 'business')).toHaveLength(1);
  });

  it('covers twelve months up to today, nothing in the future', async () => {
    const { transactions } = await loadEverything();
    const months = new Set(transactions.map((t) => t.occurredOn.monthKey));
    expect(months.size).toBeGreaterThanOrEqual(12);
    expect(transactions.some((t) => t.occurredOn.isAfter(LocalDate.parse('2026-11-07')))).toBe(false);
  });

  it('contains transfer chains and bill payments the matcher can reconcile, plus one deliberate ambiguity', async () => {
    const { accounts, transactions } = await loadEverything();
    const report = new InternalTransferMatcher().match(transactions, accounts);
    expect(report.pairs.filter((p) => p.reason === 'transfer').length).toBeGreaterThanOrEqual(24);
    expect(report.pairs.filter((p) => p.reason === 'bill_payment').length).toBeGreaterThanOrEqual(10);
    expect(report.ambiguous).toHaveLength(1);
  });

  it('uses its own category ids, all present in the default taxonomy', async () => {
    const { provider, transactions } = await loadEverything();
    const known = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    const ids = new Set(transactions.map((t) => t.providerCategoryId).filter((id): id is string => !!id));
    expect([...ids].filter((id) => !known.has(provider.categoryMap.resolve(id) ?? ''))).toEqual([]);
  });

  it('has installment purchases, including one that started before the history and one still running', async () => {
    const provider = make();
    const card = (await provider.listAccounts('demo-aurora')).find((a) => a.kind === 'credit_card');
    expect(card).toBeDefined();
    const parcels = (await provider.listTransactions(card?.externalId ?? '', lastYear)).flatMap((t) =>
      t.installment
        ? [
            Transaction.record({
              id: t.externalId,
              accountId: 'card',
              externalId: t.externalId,
              occurredOn: t.occurredOn,
              amount: t.amount,
              description: t.description,
              paymentMethod: t.paymentMethod,
              status: t.status,
              installment: Installment.of({
                number: t.installment.number,
                total: t.installment.total,
                installmentAmount: t.amount,
                ...(t.installment.totalAmount ? { totalAmount: t.installment.totalAmount } : {}),
              }),
            }),
          ]
        : [],
    );
    const grouper = new InstallmentGrouper();
    const purchases = grouper.group(parcels);

    expect(purchases.some((p) => p.firstInstallmentMonth < '2025-11')).toBe(true);
    expect(purchases.some((p) => p.remainingCount > 0)).toBe(true);
    expect(grouper.commitments(purchases, LocalDate.parse('2026-12-01'), 3).some((c) => !c.amount.isZero())).toBe(true);
  });

  it('is deterministic across instances', async () => {
    const a = await make().listTransactions('demo-agil-pf', lastYear);
    const b = await make().listTransactions('demo-agil-pf', lastYear);
    expect(b.map((t) => [t.externalId, t.amount.cents, t.description])).toEqual(
      a.map((t) => [t.externalId, t.amount.cents, t.description]),
    );
  });
});
