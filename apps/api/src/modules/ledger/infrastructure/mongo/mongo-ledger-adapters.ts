import type { Collection, Db, Long } from 'mongodb';
import { Document } from '../../../../shared/kernel/document.js';
import { AccountRepository } from '../../application/ports/account-repository.js';
import { CategorizationRuleRepository } from '../../application/ports/categorization-rule-repository.js';
import { CategoryRepository } from '../../application/ports/category-repository.js';
import { RecurrenceDismissals } from '../../application/ports/recurrence-dismissals.js';
import {
  RawPayloadStore,
  type SyncAccountResult,
  SyncLock,
  type SyncRun,
  SyncRunRepository,
} from '../../application/ports/sync-ports.js';
import { Account, type AccountKind } from '../../domain/account.js';
import { CategorizationRule, type CategorizationRuleProps } from '../../domain/categorization/categorization-rule.js';
import { Category, type CategoryKind } from '../../domain/categorization/category.js';
import { COLLECTIONS } from './ledger-collections.js';
import { fromLong, toLong } from './money-codec.js';

// ---------------------------------------------------------------------------- contas
interface AccountDocument {
  _id: string;
  externalId: string;
  institutionName: string;
  kind: AccountKind;
  holderDocument: string;
  displayName: string;
  currentBalanceCents: Long;
  creditLimitCents?: Long;
  lastSyncedAt?: Date;
}

export class MongoAccountRepository extends AccountRepository {
  private readonly collection: Collection<AccountDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<AccountDocument>(COLLECTIONS.accounts);
  }

  async save(account: Account): Promise<void> {
    const s = account.snapshot();
    const doc: AccountDocument = {
      _id: s.id,
      externalId: s.externalId,
      institutionName: s.institutionName,
      kind: s.kind,
      holderDocument: s.holderDocument.value,
      displayName: s.displayName,
      currentBalanceCents: toLong(s.currentBalance),
      ...(s.creditLimit ? { creditLimitCents: toLong(s.creditLimit) } : {}),
      ...(s.lastSyncedAt ? { lastSyncedAt: s.lastSyncedAt } : {}),
    };
    const { _id, ...rest } = doc;
    await this.collection.replaceOne({ _id }, rest, { upsert: true });
  }

  async findById(id: string): Promise<Account | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toAccount(doc) : undefined;
  }

  async findByExternalId(externalId: string): Promise<Account | undefined> {
    const doc = await this.collection.findOne({ externalId });
    return doc ? toAccount(doc) : undefined;
  }

  async findAll(): Promise<Account[]> {
    return (await this.collection.find().sort({ _id: 1 }).toArray()).map(toAccount);
  }
}

function toAccount(doc: AccountDocument): Account {
  return Account.create({
    id: doc._id,
    externalId: doc.externalId,
    institutionName: doc.institutionName,
    kind: doc.kind,
    holderDocument: Document.parse(doc.holderDocument),
    displayName: doc.displayName,
    currentBalance: fromLong(doc.currentBalanceCents),
    ...(doc.creditLimitCents !== undefined ? { creditLimit: fromLong(doc.creditLimitCents) } : {}),
    ...(doc.lastSyncedAt ? { lastSyncedAt: doc.lastSyncedAt } : {}),
  });
}

// ---------------------------------------------------------------------------- categorias
interface CategoryDocument {
  _id: string;
  name: string;
  kind: CategoryKind;
  parentId?: string;
  archived: boolean;
}

export class MongoCategoryRepository extends CategoryRepository {
  private readonly collection: Collection<CategoryDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<CategoryDocument>(COLLECTIONS.categories);
  }

  async save(category: Category): Promise<void> {
    const { id, ...rest } = category.snapshot();
    // _id vem do filtro no upsert; o documento de substituição não pode contê-lo.
    await this.collection.replaceOne({ _id: id }, rest, { upsert: true });
  }

  async findById(id: string): Promise<Category | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toCategory(doc) : undefined;
  }

  async findAll(): Promise<Category[]> {
    return (await this.collection.find().sort({ _id: 1 }).toArray()).map(toCategory);
  }
}

function toCategory({ _id, ...rest }: CategoryDocument): Category {
  return Category.create({ id: _id, ...rest });
}

// ---------------------------------------------------------------------------- regras
type RuleDocument = Omit<CategorizationRuleProps, 'id' | 'minAmount' | 'maxAmount'> & {
  _id: string;
  minAmountCents?: Long;
  maxAmountCents?: Long;
};

export class MongoCategorizationRuleRepository extends CategorizationRuleRepository {
  private readonly collection: Collection<RuleDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<RuleDocument>(COLLECTIONS.rules);
  }

  async save(rule: CategorizationRule): Promise<void> {
    const { id, minAmount, maxAmount, ...conditions } = rule.props;
    const replacement: Omit<RuleDocument, '_id'> = {
      ...conditions,
      ...(minAmount ? { minAmountCents: toLong(minAmount) } : {}),
      ...(maxAmount ? { maxAmountCents: toLong(maxAmount) } : {}),
    };
    await this.collection.replaceOne({ _id: id }, replacement, { upsert: true });
  }

  async findById(id: string): Promise<CategorizationRule | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toRule(doc) : undefined;
  }

  async findAll(): Promise<CategorizationRule[]> {
    return (await this.collection.find().sort({ priority: 1, _id: 1 }).toArray()).map(toRule);
  }

  async delete(id: string): Promise<void> {
    await this.collection.deleteOne({ _id: id });
  }
}

function toRule({ _id, minAmountCents, maxAmountCents, ...rest }: RuleDocument): CategorizationRule {
  return CategorizationRule.create({
    id: _id,
    ...rest,
    ...(minAmountCents !== undefined ? { minAmount: fromLong(minAmountCents) } : {}),
    ...(maxAmountCents !== undefined ? { maxAmount: fromLong(maxAmountCents) } : {}),
  });
}

// ---------------------------------------------------------------------------- sincronização
type SyncRunDocument = Omit<SyncRun, 'id'> & { _id: string };

export class MongoSyncRunRepository extends SyncRunRepository {
  private readonly collection: Collection<SyncRunDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<SyncRunDocument>(COLLECTIONS.syncRuns);
  }

  async save(run: SyncRun): Promise<void> {
    const { id, ...rest } = run;
    // _id vem do filtro no upsert; o documento de substituição não pode contê-lo.
    await this.collection.replaceOne({ _id: id }, rest, { upsert: true });
  }

  async findRecent(limit: number): Promise<SyncRun[]> {
    const docs = await this.collection.find().sort({ startedAt: -1 }).limit(limit).toArray();
    return docs.map(({ _id, accounts, connections, ...rest }) => ({
      id: _id,
      ...rest,
      accounts: accounts.map((a: SyncAccountResult) => ({ ...a })),
      // Registros anteriores ao retrato das conexões não têm o campo.
      connections: (connections ?? []).map((c) => ({ ...c })),
    }));
  }
}

interface LockDocument {
  _id: string;
  expiresAt: Date;
}

/** Trava com expiração: o índice TTL limpa travas antigas; a aquisição também ignora travas vencidas. */
export class MongoSyncLock extends SyncLock {
  private readonly collection: Collection<LockDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<LockDocument>(COLLECTIONS.locks);
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    try {
      await this.collection.insertOne({ _id: key, expiresAt });
      return true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const stale = await this.collection.findOneAndUpdate(
        { _id: key, expiresAt: { $lt: now } },
        { $set: { expiresAt } },
      );
      return stale !== null;
    }
  }

  async release(key: string): Promise<void> {
    await this.collection.deleteOne({ _id: key });
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

interface RawPayloadDocument {
  _id: string;
  raw: unknown;
}

export class MongoRawPayloadStore extends RawPayloadStore {
  private readonly collection: Collection<RawPayloadDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<RawPayloadDocument>(COLLECTIONS.rawPayloads);
  }

  async putMany(entries: readonly { transactionId: string; raw: unknown }[]): Promise<void> {
    if (entries.length === 0) return;
    await this.collection.bulkWrite(
      entries.map((e) => ({
        replaceOne: {
          filter: { _id: e.transactionId },
          replacement: { raw: e.raw },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async deleteMany(transactionIds: readonly string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    await this.collection.deleteMany({ _id: { $in: [...transactionIds] } });
  }
}

// ---------------------------------------------------------------------------- recorrências dispensadas
export class MongoRecurrenceDismissals extends RecurrenceDismissals {
  private readonly collection: Collection<{ _id: string; at: Date }>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<{ _id: string; at: Date }>(COLLECTIONS.recurrenceDismissals);
  }

  async dismiss(key: string): Promise<void> {
    await this.collection.updateOne({ _id: key }, { $setOnInsert: { at: new Date() } }, { upsert: true });
  }

  async all(): Promise<Set<string>> {
    return new Set((await this.collection.find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
  }
}
