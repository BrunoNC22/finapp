import type { Account } from '../../domain/account.js';

/** Porta de persistência de contas. */
export abstract class AccountRepository {
  /** Insere ou substitui pela identidade (`id`). */
  abstract save(account: Account): Promise<void>;
  abstract findById(id: string): Promise<Account | undefined>;
  abstract findByExternalId(externalId: string): Promise<Account | undefined>;
  abstract findAll(): Promise<Account[]>;
}
