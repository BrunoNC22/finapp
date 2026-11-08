import type { Collection, Db, Long } from 'mongodb';
import { Document } from '../../../../shared/kernel/document.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { type TransactionPeriodQuery, TransactionRepository } from '../../application/ports/transaction-repository.js';
import { foldText } from '../../domain/categorization/categorization-rule.js';
import { Installment } from '../../domain/installment.js';
import {
  type CategorySource,
  type Classification,
  type ClassificationSource,
  type PaymentMethod,
  Transaction,
  type TransactionStatus,
} from '../../domain/transaction.js';
import { COLLECTIONS } from './ledger-collections.js';
import { fromLong, toLong } from './money-codec.js';

interface TransactionDocument {
  _id: string;
  accountId: string;
  externalId: string;
  /** AAAA-MM-DD: ordena corretamente como texto. */
  occurredOn: string;
  amountCents: Long;
  description: string;
  /** Descrição sem acentos e em minúsculas, para busca. */
  descriptionFolded: string;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  counterparty?: { name?: string; document?: string };
  installment?: {
    number: number;
    total: number;
    totalAmountCents: Long;
    totalAmountIsEstimated: boolean;
    purchaseDate?: string;
  };
  providerCategoryId?: string;
  classification: Classification;
  classificationSource: ClassificationSource;
  transferLink?: string;
  category?: { categoryId: string; source: CategorySource };
}

export type { TransactionDocument };

export class MongoTransactionRepository extends TransactionRepository {
  private readonly collection: Collection<TransactionDocument>;

  constructor(db: Db) {
    super();
    this.collection = db.collection<TransactionDocument>(COLLECTIONS.transactions);
  }

  async save(transaction: Transaction): Promise<void> {
    const { _id, ...rest } = toDocument(transaction);
    await this.collection.replaceOne({ _id }, rest, { upsert: true });
  }

  async saveMany(transactions: readonly Transaction[]): Promise<void> {
    if (transactions.length === 0) return;
    await this.collection.bulkWrite(
      transactions.map((t) => {
        const { _id, ...replacement } = toDocument(t);
        return { replaceOne: { filter: { _id }, replacement, upsert: true } };
      }),
      { ordered: false },
    );
  }

  async deleteMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.collection.deleteMany({ _id: { $in: [...ids] } });
  }

  async findById(id: string): Promise<Transaction | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toEntity(doc) : undefined;
  }

  async findByExternalId(accountId: string, externalId: string): Promise<Transaction | undefined> {
    const doc = await this.collection.findOne({ accountId, externalId });
    return doc ? toEntity(doc) : undefined;
  }

  /** Migração: preenche o campo de busca em documentos gravados antes dele existir. */
  async backfillSearchFields(): Promise<number> {
    const missing = await this.collection
      .find({ descriptionFolded: { $exists: false } }, { projection: { description: 1 } })
      .toArray();
    if (missing.length === 0) return 0;
    await this.collection.bulkWrite(
      missing.map((d) => ({
        updateOne: { filter: { _id: d._id }, update: { $set: { descriptionFolded: foldText(d.description) } } },
      })),
      { ordered: false },
    );
    return missing.length;
  }

  async findInPeriod(query: TransactionPeriodQuery): Promise<Transaction[]> {
    const docs = await this.collection
      .find({
        occurredOn: { $gte: query.from.toString(), $lte: query.to.toString() },
        ...(query.accountIds ? { accountId: { $in: [...query.accountIds] } } : {}),
      })
      .sort({ occurredOn: 1, _id: 1 })
      .toArray();
    return docs.map(toEntity);
  }

  async findManuallyCategorized(): Promise<Transaction[]> {
    return (await this.collection.find({ 'category.source': 'manual' }).toArray()).map(toEntity);
  }
}

function toDocument(transaction: Transaction): TransactionDocument {
  const { props, state } = transaction.snapshot();
  const { counterparty, installment } = props;
  return {
    _id: props.id,
    accountId: props.accountId,
    externalId: props.externalId,
    occurredOn: props.occurredOn.toString(),
    amountCents: toLong(props.amount),
    description: props.description,
    descriptionFolded: foldText(props.description),
    paymentMethod: props.paymentMethod,
    status: props.status,
    ...(counterparty
      ? {
          counterparty: {
            ...(counterparty.name ? { name: counterparty.name } : {}),
            ...(counterparty.document ? { document: counterparty.document.value } : {}),
          },
        }
      : {}),
    ...(installment
      ? {
          installment: {
            number: installment.number,
            total: installment.total,
            totalAmountCents: toLong(installment.totalAmount),
            totalAmountIsEstimated: installment.totalAmountIsEstimated,
            ...(installment.purchaseDate ? { purchaseDate: installment.purchaseDate.toString() } : {}),
          },
        }
      : {}),
    ...(props.providerCategoryId ? { providerCategoryId: props.providerCategoryId } : {}),
    classification: state.classification,
    classificationSource: state.classificationSource,
    ...(state.transferLink ? { transferLink: state.transferLink } : {}),
    ...(state.category ? { category: { ...state.category } } : {}),
  };
}

export function toEntity(doc: TransactionDocument): Transaction {
  const counterparty = doc.counterparty
    ? {
        ...(doc.counterparty.name ? { name: doc.counterparty.name } : {}),
        ...(doc.counterparty.document ? { document: Document.parse(doc.counterparty.document) } : {}),
      }
    : undefined;
  const installment = doc.installment ? toInstallment(doc.installment) : undefined;
  return Transaction.restore(
    {
      id: doc._id,
      accountId: doc.accountId,
      externalId: doc.externalId,
      occurredOn: LocalDate.parse(doc.occurredOn),
      amount: fromLong(doc.amountCents),
      description: doc.description,
      paymentMethod: doc.paymentMethod,
      status: doc.status,
      ...(counterparty ? { counterparty } : {}),
      ...(installment ? { installment } : {}),
      ...(doc.providerCategoryId ? { providerCategoryId: doc.providerCategoryId } : {}),
    },
    {
      classification: doc.classification,
      classificationSource: doc.classificationSource,
      ...(doc.transferLink ? { transferLink: doc.transferLink } : {}),
      ...(doc.category ? { category: { categoryId: doc.category.categoryId, source: doc.category.source } } : {}),
    },
  );
}

function toInstallment(i: NonNullable<TransactionDocument['installment']>): Installment {
  const total = fromLong(i.totalAmountCents);
  const purchaseDate = i.purchaseDate ? { purchaseDate: LocalDate.parse(i.purchaseDate) } : {};
  // Total estimado = parcela × n: reconstruímos a partir da parcela para manter o flag "estimado".
  return i.totalAmountIsEstimated
    ? Installment.of({
        number: i.number,
        total: i.total,
        installmentAmount: Money.fromCents(total.cents / i.total),
        ...purchaseDate,
      })
    : Installment.of({ number: i.number, total: i.total, totalAmount: total, ...purchaseDate });
}
