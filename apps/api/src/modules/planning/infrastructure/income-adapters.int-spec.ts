import { afterAll, beforeAll, expect, it } from 'vitest';
import { incomeSourceRepositoryContract } from '../../../../test/contracts/income-source-repository.contract.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { Money } from '../../../shared/kernel/money.js';
import { YearMonth } from '../../../shared/kernel/year-month.js';
import { IncomeSource } from '../domain/income/income-source.js';
import { MongoIncomeSourceRepository, PLANNING_COLLECTIONS } from './income-adapters.js';

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await TestMongo.start();
});
afterAll(async () => {
  await mongo?.stop();
});

incomeSourceRepositoryContract('MongoDB', async () => new MongoIncomeSourceRepository(mongo.freshDb()));

it('stores money as Int64, never as a floating point number', async () => {
  const db = mongo.freshDb();
  await new MongoIncomeSourceRepository(db).save(
    IncomeSource.create({
      id: 'x',
      name: 'X',
      kind: 'other',
      expectedMonthly: Money.fromCents(123),
      startsOn: YearMonth.parse('2026-01'),
      risk: 'low',
      status: 'active',
    }),
  );
  const raw = await db
    .collection(PLANNING_COLLECTIONS.incomeSources)
    .findOne({ _id: 'x' as never }, { promoteLongs: false });
  expect(raw?.expectedMonthlyCents?._bsontype).toBe('Long');
});
