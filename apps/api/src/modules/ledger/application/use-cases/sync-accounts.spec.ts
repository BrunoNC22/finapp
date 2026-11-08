import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import { InMemoryAccountRepository } from '../../../../../test/doubles/in-memory-account-repository.js';
import {
  InMemoryCategorizationRuleRepository,
  InMemoryCategoryRepository,
} from '../../../../../test/doubles/in-memory-categorization.js';
import {
  InMemoryRawPayloadStore,
  InMemorySyncLock,
  InMemorySyncRunRepository,
} from '../../../../../test/doubles/in-memory-sync.js';
import { InMemoryTransactionRepository } from '../../../../../test/doubles/in-memory-transaction-repository.js';
import { SequentialIdGenerator } from '../../../../../test/doubles/sequential-id-generator.js';
import { StubOpenFinanceProvider } from '../../../../../test/doubles/stub-open-finance-provider.js';
import { SYNTHETIC_CPF_DIGITS } from '../../../../../test/fixtures/synthetic-documents.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { DemoOpenFinanceProvider } from '../../infrastructure/demo/demo-open-finance-provider.js';
import type { OpenFinanceProvider, ProviderAccount, ProviderTransaction } from '../ports/open-finance-provider.js';
import { SeedDefaultCategorization } from './categorization.js';
import { SyncAccounts } from './sync-accounts.js';

const NOW = new Date('2026-11-07T15:00:00Z');

function setup(provider: OpenFinanceProvider) {
  const deps = {
    accounts: new InMemoryAccountRepository(),
    transactions: new InMemoryTransactionRepository(),
    rules: new InMemoryCategorizationRuleRepository(),
    runs: new InMemorySyncRunRepository(),
    lock: new InMemorySyncLock(),
    raw: new InMemoryRawPayloadStore(),
    clock: new FixedClock(NOW),
  };
  const sync = new SyncAccounts({ provider, ids: new SequentialIdGenerator('id'), ...deps });
  return { sync, ...deps };
}

const checking: ProviderAccount = {
  externalId: 'ext-bank',
  connectionId: 'conn',
  institutionName: 'Banco Fictício',
  name: 'Conta',
  kind: 'checking',
  holderDocument: SYNTHETIC_CPF_DIGITS,
  balance: Money.fromCents(1000),
};
const card: ProviderAccount = { ...checking, externalId: 'ext-card', name: 'Cartão', kind: 'credit_card' };

const providerTx = (
  externalId: string,
  day: string,
  cents: number,
  extra: Partial<ProviderTransaction> = {},
): ProviderTransaction => ({
  externalId,
  accountExternalId: 'ext-card',
  occurredOn: LocalDate.parse(day),
  amount: Money.fromCents(cents),
  description: 'COMPRA EXEMPLO',
  paymentMethod: 'card_purchase',
  status: 'posted',
  raw: { externalId },
  ...extra,
});

describe('SyncAccounts', () => {
  describe('with the demo provider', () => {
    let env: ReturnType<typeof setup>;
    beforeEach(async () => {
      env = setup(new DemoOpenFinanceProvider(new FixedClock(NOW)));
      await new SeedDefaultCategorization(new InMemoryCategoryRepository(), env.rules).execute();
    });

    it('imports accounts and transactions, categorizes and reconciles transfers', async () => {
      const run = await env.sync.execute();

      expect(run.status).toBe('success');
      expect(await env.accounts.findAll()).toHaveLength(5);
      expect(run.accounts.reduce((sum, a) => sum + a.created, 0)).toBe(env.transactions.size);
      expect(run.transferPairs).toBeGreaterThan(30);
      expect(run.ambiguousTransfers).toBe(1);
      expect(env.raw.payloads.size).toBe(env.transactions.size);
      expect(await env.runs.findRecent(1)).toEqual([run]);
    });

    it('is idempotent: syncing again changes nothing', async () => {
      await env.sync.execute();
      const all = async () =>
        (
          await env.transactions.findInPeriod({
            from: LocalDate.parse('2000-01-01'),
            to: LocalDate.parse('2100-01-01'),
          })
        )
          .map((t) => t.snapshot())
          .sort((a, b) => a.props.id.localeCompare(b.props.id));
      const before = await all();

      const second = await env.sync.execute();

      expect(second.accounts.every((a) => a.created === 0 && a.removed === 0)).toBe(true);
      expect(await all()).toEqual(before);
    });
  });

  it('asks only for a window overlapping the last sync (35 days) after the first import', async () => {
    const provider = new StubOpenFinanceProvider([card]);
    const env = setup(provider);
    await env.sync.execute();
    env.clock.advanceDays(10);

    await env.sync.execute();

    expect(provider.requestedRanges[0]).toEqual({ account: 'ext-card', from: '2025-11-07', to: '2026-11-07' });
    expect(provider.requestedRanges[1]).toEqual({ account: 'ext-card', from: '2026-10-03', to: '2026-11-17' });
  });

  it('a full sync revisits the whole initial window, so improved rules reach older months', async () => {
    const provider = new StubOpenFinanceProvider(
      [card],
      // Crédito de pagamento da fatura que um mapeamento antigo gravou como estorno (contava como gasto).
      [providerTx('old', '2026-03-10', 15000, { paymentMethod: 'refund', description: 'PAGAMENTO EFETUADO' })],
    );
    const env = setup(provider);
    await env.sync.execute();
    env.clock.advanceDays(10);
    provider.transactions = [
      providerTx('old', '2026-03-10', 15000, { paymentMethod: 'bill_payment', description: 'PAGAMENTO EFETUADO' }),
    ];

    await env.sync.execute({ full: true });

    expect(provider.requestedRanges[1]).toEqual({ account: 'ext-card', from: '2025-11-17', to: '2026-11-17' });
    const [old] = await env.transactions.findInPeriod({
      from: LocalDate.parse('2026-03-10'),
      to: LocalDate.parse('2026-03-10'),
    });
    expect(old?.paymentMethod).toBe('bill_payment');
    expect(old?.classification).toBe('internal_transfer');
  });

  it('updates a transaction that changed at the provider and keeps the user decisions', async () => {
    const provider = new StubOpenFinanceProvider(
      [card],
      [providerTx('t1', '2026-11-01', -5000, { status: 'pending' })],
    );
    const env = setup(provider);
    await env.sync.execute();
    const [local] = await env.transactions.findInPeriod({
      from: LocalDate.parse('2026-11-01'),
      to: LocalDate.parse('2026-11-01'),
    });
    local?.categorize('lazer.outros', 'manual');
    if (local) await env.transactions.save(local);

    provider.transactions = [providerTx('t1', '2026-11-01', -5200, { status: 'posted' })];
    const run = await env.sync.execute();

    const updated = await env.transactions.findByExternalId(local?.accountId ?? '', 't1');
    expect(run.accounts[0]?.updated).toBe(1);
    expect(updated?.status).toBe('posted');
    expect(updated?.amount.cents).toBe(-5200);
    expect(updated?.category).toEqual({ categoryId: 'lazer.outros', source: 'manual' });
  });

  it('replaces a vanished pending transaction by its posted twin, carrying the manual category', async () => {
    const provider = new StubOpenFinanceProvider(
      [card],
      [providerTx('pending-1', '2026-11-01', -5000, { status: 'pending' })],
    );
    const env = setup(provider);
    await env.sync.execute();
    const pending = await env.transactions.findInPeriod({
      from: LocalDate.parse('2026-11-01'),
      to: LocalDate.parse('2026-11-01'),
    });
    pending[0]?.categorize('moradia.casa', 'manual');
    if (pending[0]) await env.transactions.save(pending[0]);

    provider.transactions = [providerTx('posted-1', '2026-11-02', -5000, { status: 'posted' })];
    const run = await env.sync.execute();

    const remaining = await env.transactions.findInPeriod({
      from: LocalDate.parse('2026-10-01'),
      to: LocalDate.parse('2026-11-30'),
    });
    expect(run.accounts[0]).toMatchObject({ created: 1, removed: 1 });
    expect(remaining.map((t) => t.externalId)).toEqual(['posted-1']);
    expect(remaining[0]?.category).toEqual({ categoryId: 'moradia.casa', source: 'manual' });
    expect(env.raw.payloads.has(pending[0]?.id ?? '')).toBe(false);
  });

  it('never removes posted transactions that are outside the provider answer', async () => {
    const provider = new StubOpenFinanceProvider([card], [providerTx('old', '2026-11-01', -5000)]);
    const env = setup(provider);
    await env.sync.execute();
    provider.transactions = [];

    const run = await env.sync.execute();

    expect(run.accounts[0]?.removed).toBe(0);
    expect(env.transactions.size).toBe(1);
  });

  it('keeps going when one account fails, and reports a partial run with a safe message', async () => {
    const provider = new StubOpenFinanceProvider([checking, card], [providerTx('t1', '2026-11-01', -5000)]);
    provider.failOn('ext-bank');
    const env = setup(provider);

    const run = await env.sync.execute();

    expect(run.status).toBe('partial');
    expect(run.accounts.find((a) => a.accountExternalId === 'ext-bank')?.error).toBe('provider unavailable');
    expect(run.accounts.find((a) => a.accountExternalId === 'ext-card')?.created).toBe(1);
  });

  it('does not run while another sync holds the lock', async () => {
    const env = setup(new StubOpenFinanceProvider([card]));
    env.lock.holdBySomeoneElse('ledger-sync');

    await expect(env.sync.execute()).rejects.toThrow('sincronização já em andamento');
  });

  it('records the latest balance of each account', async () => {
    const env = setup(new StubOpenFinanceProvider([{ ...checking, balance: Money.fromCents(4321) }]));
    await env.sync.execute();
    const [account] = await env.accounts.findAll();
    expect(account?.currentBalance.cents).toBe(4321);
    expect(account?.lastSyncedAt).toEqual(NOW);
  });
});
