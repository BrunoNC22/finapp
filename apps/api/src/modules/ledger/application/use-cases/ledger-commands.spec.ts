import { beforeEach, describe, expect, it } from 'vitest';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import {
  InMemoryCategorizationRuleRepository,
  InMemoryCategoryRepository,
} from '../../../../../test/doubles/in-memory-categorization.js';
import { InMemoryTransactionRepository } from '../../../../../test/doubles/in-memory-transaction-repository.js';
import { Money } from '../../../../shared/kernel/money.js';
import { InvalidCategoryError } from '../../domain/categorization/category.js';
import { Installment } from '../../domain/installment.js';
import { SeedDefaultCategorization, UnknownCategoryError, UnknownTransactionError } from './categorization.js';
import {
  ClassifyTransactionManually,
  CreateCategory,
  GetInstallmentPurchases,
  UpdateCategory,
} from './ledger-commands.js';

describe('ClassifyTransactionManually', () => {
  let transactions: InMemoryTransactionRepository;
  beforeEach(() => {
    transactions = new InMemoryTransactionRepository();
  });

  it('links both sides when the user declares an internal transfer', async () => {
    await transactions.saveMany([
      aTransaction().withId('out').withAccount('a').withAmount(-5000).withPaymentMethod('pix').build(),
      aTransaction().withId('in').withAccount('b').withAmount(5000).withPaymentMethod('pix').build(),
    ]);

    await new ClassifyTransactionManually(transactions).execute({
      transactionId: 'out',
      classification: 'internal_transfer',
      counterpartId: 'in',
    });

    const [out, into] = [await transactions.findById('out'), await transactions.findById('in')];
    expect([out?.transferLink, out?.classificationSource]).toEqual(['in', 'manual']);
    expect([into?.transferLink, into?.classification, into?.classificationSource]).toEqual([
      'out',
      'internal_transfer',
      'manual',
    ]);
  });

  it('undoing a transfer also releases the other side back to its default classification', async () => {
    const out = aTransaction().withId('out').withAccount('a').withAmount(-5000).withPaymentMethod('pix').build();
    const into = aTransaction().withId('in').withAccount('b').withAmount(5000).withPaymentMethod('pix').build();
    out.markAsInternalTransfer('in');
    into.markAsInternalTransfer('out');
    await transactions.saveMany([out, into]);

    await new ClassifyTransactionManually(transactions).execute({ transactionId: 'out', classification: 'expense' });

    const other = await transactions.findById('in');
    expect((await transactions.findById('out'))?.classification).toBe('expense');
    expect([other?.transferLink, other?.classification, other?.classificationSource]).toEqual([
      undefined,
      'income',
      'default',
    ]);
  });

  it('rejects unknown transactions and counterparts', async () => {
    await transactions.save(aTransaction().withId('t').build());
    const useCase = new ClassifyTransactionManually(transactions);
    await expect(useCase.execute({ transactionId: 'missing', classification: 'expense' })).rejects.toThrow(
      UnknownTransactionError,
    );
    await expect(
      useCase.execute({ transactionId: 't', classification: 'internal_transfer', counterpartId: 'missing' }),
    ).rejects.toThrow(UnknownTransactionError);
  });
});

describe('categories', () => {
  let categories: InMemoryCategoryRepository;
  beforeEach(async () => {
    categories = new InMemoryCategoryRepository();
    await new SeedDefaultCategorization(categories, new InMemoryCategorizationRuleRepository()).execute();
  });

  it('creates a group or a subcategory with an id derived from the name', async () => {
    const create = new CreateCategory(categories);
    const group = await create.execute({ name: 'Moto', kind: 'expense' });
    const child = await create.execute({ name: 'Peças e equipamentos', kind: 'expense', parentId: group.id });

    expect(group.id).toBe('moto');
    expect(child.id).toBe('moto.pecas-e-equipamentos');
  });

  it('never reuses an existing id', async () => {
    const created = await new CreateCategory(categories).execute({
      name: 'Mercado',
      kind: 'expense',
      parentId: 'alimentacao',
    });
    expect(created.id).toBe('alimentacao.mercado-2');
  });

  it('a subcategory needs an existing group and inherits its kind rules', async () => {
    await expect(
      new CreateCategory(categories).execute({ name: 'X', kind: 'expense', parentId: 'nope' }),
    ).rejects.toThrow(UnknownCategoryError);
    await expect(
      new CreateCategory(categories).execute({ name: 'X', kind: 'expense', parentId: 'alimentacao.mercado' }),
    ).rejects.toThrow(InvalidCategoryError);
  });

  it('renames and archives', async () => {
    const update = new UpdateCategory(categories);
    await update.execute('alimentacao.mercado', { name: 'Supermercado' });
    await update.execute('lazer.apostas', { archived: true });
    expect((await categories.findById('alimentacao.mercado'))?.name).toBe('Supermercado');
    expect((await categories.findById('lazer.apostas'))?.archived).toBe(true);
  });
});

describe('GetInstallmentPurchases', () => {
  it('groups the installments of the last months and projects what is still due', async () => {
    const transactions = new InMemoryTransactionRepository();
    const parcel = (id: string, n: number, day: string) =>
      aTransaction()
        .withId(id)
        .withAccount('card')
        .withDescription('LOJA')
        .withAmount(-2500)
        .on(day)
        .withPaymentMethod('card_purchase')
        .withInstallment(Installment.of({ number: n, total: 4, installmentAmount: Money.fromCents(2500) }))
        .build();
    await transactions.saveMany([parcel('p1', 1, '2026-09-10'), parcel('p2', 2, '2026-10-10')]);

    const purchases = await new GetInstallmentPurchases(
      transactions,
      new FixedClock(new Date('2026-11-07T12:00:00Z')),
    ).execute();

    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.projectRemaining().map((p) => p.expectedMonth)).toEqual(['2026-11', '2026-12']);
  });
});
