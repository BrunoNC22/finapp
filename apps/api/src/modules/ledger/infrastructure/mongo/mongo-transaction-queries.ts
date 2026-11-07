import type { Collection, Db, Filter } from 'mongodb';
import {
  type TransactionCursor,
  type TransactionFilter,
  TransactionQueries,
  type TransactionSearchResult,
} from '../../application/ports/transaction-queries.js';
import { foldText } from '../../domain/categorization/categorization-rule.js';
import { COLLECTIONS } from './ledger-collections.js';
import { type TransactionDocument, toEntity } from './mongo-transaction-repository.js';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Modelo de leitura no MongoDB: filtros, busca sem acento e paginação por cursor (data desc, id desc). */
export class MongoTransactionQueries extends TransactionQueries {
  private readonly collection: Collection<TransactionDocument>;

  constructor(db: Db) {
    super();
    this.collection = db.collection<TransactionDocument>(COLLECTIONS.transactions);
  }

  async search(
    filter: TransactionFilter,
    page: { cursor?: TransactionCursor; limit: number },
  ): Promise<TransactionSearchResult> {
    const conditions: Filter<TransactionDocument>[] = [];
    if (filter.from || filter.to) {
      conditions.push({
        occurredOn: {
          ...(filter.from ? { $gte: filter.from.toString() } : {}),
          ...(filter.to ? { $lte: filter.to.toString() } : {}),
        },
      });
    }
    if (filter.accountId) conditions.push({ accountId: filter.accountId });
    if (filter.categoryId) conditions.push({ 'category.categoryId': filter.categoryId });
    if (filter.classification) conditions.push({ classification: filter.classification });
    if (filter.paymentMethod) conditions.push({ paymentMethod: filter.paymentMethod });
    if (filter.text) conditions.push({ descriptionFolded: { $regex: escapeRegex(foldText(filter.text)) } });
    if (filter.uncategorized) {
      conditions.push({ category: { $exists: false }, classification: { $in: ['income', 'expense'] } });
    }
    if (page.cursor) {
      const { occurredOn, id } = page.cursor;
      conditions.push({ $or: [{ occurredOn: { $lt: occurredOn } }, { occurredOn, _id: { $lt: id } }] });
    }

    const docs = await this.collection
      .find(conditions.length ? { $and: conditions } : {})
      .sort({ occurredOn: -1, _id: -1 })
      .limit(page.limit + 1)
      .toArray();
    const items = docs.slice(0, page.limit).map(toEntity);
    const last = items.at(-1);
    return docs.length > page.limit && last
      ? { items, next: { occurredOn: last.occurredOn.toString(), id: last.id } }
      : { items };
  }
}
