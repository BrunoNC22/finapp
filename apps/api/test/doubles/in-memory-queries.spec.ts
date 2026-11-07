import { transactionQueriesContract } from '../contracts/transaction-queries.contract.js';
import { InMemoryTransactionQueries } from './in-memory-transaction-queries.js';
import { InMemoryTransactionRepository } from './in-memory-transaction-repository.js';

transactionQueriesContract('in-memory', async () => {
  const repository = new InMemoryTransactionRepository();
  return { repository, queries: new InMemoryTransactionQueries(repository) };
});
