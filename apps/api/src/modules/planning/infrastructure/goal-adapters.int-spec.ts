import { afterAll, beforeAll } from 'vitest';
import { goalRepositoryContract } from '../../../../test/contracts/goal-repository.contract.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { MongoGoalRepository } from './goal-adapters.js';

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await TestMongo.start();
});
afterAll(async () => {
  await mongo?.stop();
});

goalRepositoryContract('MongoDB', async () => new MongoGoalRepository(mongo.freshDb()));
