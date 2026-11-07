import { accountRepositoryContract } from '../contracts/account-repository.contract.js';
import { transactionRepositoryContract } from '../contracts/transaction-repository.contract.js';
import { InMemoryAccountRepository } from './in-memory-account-repository.js';
import { InMemoryTransactionRepository } from './in-memory-transaction-repository.js';

transactionRepositoryContract('in-memory', async () => new InMemoryTransactionRepository());
accountRepositoryContract('in-memory', async () => new InMemoryAccountRepository());
