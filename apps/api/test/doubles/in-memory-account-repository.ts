import { AccountRepository } from '../../src/modules/ledger/application/ports/account-repository.js';
import { Account } from '../../src/modules/ledger/domain/account.js';

type Snapshot = ReturnType<Account['snapshot']>;

/** Fake em memória: guarda snapshots e devolve cópias (veja InMemoryTransactionRepository). */
export class InMemoryAccountRepository extends AccountRepository {
  private readonly rows = new Map<string, Snapshot>();

  async save(account: Account): Promise<void> {
    this.rows.set(account.id, { ...account.snapshot() });
  }

  async findById(id: string): Promise<Account | undefined> {
    const row = this.rows.get(id);
    return row ? Account.create({ ...row }) : undefined;
  }

  async findByExternalId(externalId: string): Promise<Account | undefined> {
    const row = [...this.rows.values()].find((r) => r.externalId === externalId);
    return row ? Account.create({ ...row }) : undefined;
  }

  async findAll(): Promise<Account[]> {
    return [...this.rows.values()].map((row) => Account.create({ ...row }));
  }
}
