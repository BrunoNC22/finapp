import type { Db } from 'mongodb';

export const COLLECTIONS = {
  accounts: 'accounts',
  transactions: 'transactions',
  rawPayloads: 'raw_payloads',
  categories: 'categories',
  rules: 'categorization_rules',
  syncRuns: 'sync_runs',
  locks: 'locks',
} as const;

/** Cria os índices do ledger (idempotente). Chamado no boot e nos testes de integração. */
export async function ensureLedgerIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.accounts).createIndex({ externalId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.transactions).createIndex({ accountId: 1, externalId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.transactions).createIndex({ occurredOn: 1 }),
    db.collection(COLLECTIONS.transactions).createIndex({ classification: 1, occurredOn: 1 }),
    db.collection(COLLECTIONS.transactions).createIndex({ 'category.categoryId': 1, occurredOn: 1 }),
    db.collection(COLLECTIONS.syncRuns).createIndex({ startedAt: -1 }),
    // A trava expira sozinha: processo que morreu não bloqueia a sincronização para sempre.
    db.collection(COLLECTIONS.locks).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
