import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountRepositoryContract } from '../../../../../test/contracts/account-repository.contract.js';
import { transactionRepositoryContract } from '../../../../../test/contracts/transaction-repository.contract.js';
import { TestMongo } from '../../../../../test/mongo/test-mongo.js';
import { Money } from '../../../../shared/kernel/money.js';
import { CategorizationRule } from '../../domain/categorization/categorization-rule.js';
import { Category } from '../../domain/categorization/category.js';
import { ensureLedgerIndexes } from './ledger-collections.js';
import {
  MongoAccountRepository,
  MongoCategorizationRuleRepository,
  MongoCategoryRepository,
  MongoRawPayloadStore,
  MongoSyncLock,
  MongoSyncRunRepository,
} from './mongo-ledger-adapters.js';
import { MongoTransactionRepository } from './mongo-transaction-repository.js';

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await TestMongo.start();
});
afterAll(async () => {
  await mongo?.stop();
});

const freshDb = async () => {
  const db = mongo.freshDb();
  await ensureLedgerIndexes(db);
  return db;
};

transactionRepositoryContract('MongoDB', async () => new MongoTransactionRepository(await freshDb()));
accountRepositoryContract('MongoDB', async () => new MongoAccountRepository(await freshDb()));

describe('MongoDB ledger adapters', () => {
  it('stores money as Int64, never as a floating point number', async () => {
    const db = await freshDb();
    const accounts = new MongoAccountRepository(db);
    const { anAccount } = await import('../../../../../test/builders/account.builder.js');
    const account = anAccount().withId('acc').build();
    account.recordBalance(Money.fromCents(123456789), new Date());
    await accounts.save(account);

    const types = await db
      .collection('accounts')
      .aggregate([{ $project: { t: { $type: '$currentBalanceCents' } } }])
      .toArray();
    expect(types[0]?.t).toBe('long');
  });

  it('round-trips categories and rules (with amount range)', async () => {
    const db = await freshDb();
    const categories = new MongoCategoryRepository(db);
    const rules = new MongoCategorizationRuleRepository(db);
    const category = Category.create({ id: 'moradia.aluguel', name: 'Aluguel', kind: 'expense', parentId: 'moradia' });
    const rule = CategorizationRule.create({
      id: 'r1',
      name: 'Aluguel',
      categoryId: 'moradia.aluguel',
      priority: 10,
      enabled: true,
      descriptionContains: 'aluguel',
      minAmount: Money.fromCents(50000),
      maxAmount: Money.fromCents(150000),
    });
    await categories.save(category);
    await rules.save(rule);

    expect((await categories.findById('moradia.aluguel'))?.snapshot()).toEqual(category.snapshot());
    expect((await rules.findById('r1'))?.props).toEqual(rule.props);
  });

  it('lock: exclusive while held, free after release, and recoverable when expired', async () => {
    const lock = new MongoSyncLock(await freshDb());
    expect(await lock.acquire('k', 60_000)).toBe(true);
    expect(await lock.acquire('k', 60_000)).toBe(false);
    await lock.release('k');
    expect(await lock.acquire('k', 1)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await lock.acquire('k', 60_000)).toBe(true); // a anterior expirou
  });

  it('keeps sync runs most recent first and raw payloads by transaction id', async () => {
    const db = await freshDb();
    const runs = new MongoSyncRunRepository(db);
    const base = {
      finishedAt: new Date(),
      status: 'success' as const,
      accounts: [],
      transferPairs: 0,
      ambiguousTransfers: 0,
      uncategorized: 0,
    };
    await runs.save({ id: 'old', startedAt: new Date('2026-01-01'), ...base });
    await runs.save({ id: 'new', startedAt: new Date('2026-02-01'), ...base });
    expect((await runs.findRecent(5)).map((r) => r.id)).toEqual(['new', 'old']);

    const raw = new MongoRawPayloadStore(db);
    await raw.putMany([{ transactionId: 't1', raw: { a: 1 } }]);
    await raw.deleteMany(['t1']);
    expect(await db.collection('raw_payloads').countDocuments()).toBe(0);
  });
});
