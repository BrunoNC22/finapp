import { beforeEach, describe, expect, it } from 'vitest';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import {
  InMemoryCategorizationRuleRepository,
  InMemoryCategoryRepository,
  StubProviderCategoryMap,
} from '../../../../../test/doubles/in-memory-categorization.js';
import { InMemoryTransactionRepository } from '../../../../../test/doubles/in-memory-transaction-repository.js';
import { SequentialIdGenerator } from '../../../../../test/doubles/sequential-id-generator.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Categorizer } from '../../domain/categorization/categorizer.js';
import { DEFAULT_CATEGORIES } from '../../domain/categorization/default-taxonomy.js';
import {
  CategorizeTransactionManually,
  CreateCategorizationRule,
  SeedDefaultCategorization,
  UnknownCategoryError,
} from './categorization.js';

describe('categorization use cases', () => {
  let categories: InMemoryCategoryRepository;
  let rules: InMemoryCategorizationRuleRepository;
  let transactions: InMemoryTransactionRepository;
  const categorizer = new Categorizer(new StubProviderCategoryMap({ 'prov-gym': 'lazer.esportes' }));

  beforeEach(async () => {
    categories = new InMemoryCategoryRepository();
    rules = new InMemoryCategorizationRuleRepository();
    transactions = new InMemoryTransactionRepository();
    await new SeedDefaultCategorization(categories, rules).execute();
  });

  describe('SeedDefaultCategorization', () => {
    it('creates the default taxonomy and default rules', async () => {
      expect(await categories.findAll()).toHaveLength(DEFAULT_CATEGORIES.length);
      expect((await rules.findAll()).length).toBeGreaterThan(0);
    });

    it('is idempotent and never overwrites what the user changed', async () => {
      const groceries = await categories.findById('alimentacao.mercado');
      groceries?.rename('Supermercado');
      if (groceries) await categories.save(groceries);
      const [defaultRule] = await rules.findAll();

      const report = await new SeedDefaultCategorization(categories, rules).execute();

      expect(report).toEqual({ categoriesCreated: 0, rulesCreated: 0 });
      expect((await categories.findById('alimentacao.mercado'))?.name).toBe('Supermercado');
      expect(await rules.findAll()).toHaveLength(1);
      expect((await rules.findById(defaultRule?.id ?? ''))?.categoryId).toBe(defaultRule?.categoryId);
    });
  });

  describe('CreateCategorizationRule', () => {
    const period = { from: LocalDate.parse('2026-01-01'), to: LocalDate.parse('2026-12-31') };

    it('saves the rule and, if asked, applies it to existing transactions (except manual ones)', async () => {
      const pixToLandlord = aTransaction()
        .withId('t1')
        .withDescription('Pix enviado aluguel')
        .withPaymentMethod('pix')
        .on('2026-03-05')
        .build();
      const manual = aTransaction()
        .withId('t2')
        .withDescription('Pix enviado aluguel')
        .withPaymentMethod('pix')
        .on('2026-04-05')
        .build();
      manual.categorize('outros', 'manual');
      await transactions.saveMany([pixToLandlord, manual]);

      const useCase = new CreateCategorizationRule(
        rules,
        categories,
        transactions,
        categorizer,
        new SequentialIdGenerator('rule'),
      );
      const result = await useCase.execute({
        rule: {
          name: 'Aluguel',
          categoryId: 'moradia.aluguel',
          priority: 10,
          enabled: true,
          descriptionContains: 'aluguel',
        },
        applyTo: period,
      });

      expect(result.ruleId).toBe('rule-1');
      expect(result.affected).toBe(1);
      expect((await transactions.findById('t1'))?.category).toEqual({ categoryId: 'moradia.aluguel', source: 'rule' });
      expect((await transactions.findById('t2'))?.category?.source).toBe('manual');
    });

    it('rejects a rule pointing to an unknown or archived category', async () => {
      const useCase = new CreateCategorizationRule(
        rules,
        categories,
        transactions,
        categorizer,
        new SequentialIdGenerator(),
      );
      await expect(
        useCase.execute({
          rule: { name: 'x', categoryId: 'nao.existe', priority: 1, enabled: true, descriptionContains: 'x' },
        }),
      ).rejects.toThrow(UnknownCategoryError);
    });
  });

  describe('CategorizeTransactionManually', () => {
    it('sets a manual category that automation will not override', async () => {
      await transactions.save(aTransaction().withId('t1').withProviderCategory('prov-gym').build());

      await new CategorizeTransactionManually(transactions, categories, rules, categorizer).execute({
        transactionId: 't1',
        categoryId: 'transporte.app',
      });
      const tx = await transactions.findById('t1');
      if (tx) categorizer.categorize([tx], await rules.findAll());

      expect(tx?.category).toEqual({ categoryId: 'transporte.app', source: 'manual' });
    });

    it('applies the correction to the same counterparty in every month; money back from it becomes a refund', async () => {
      const pixTo = (id: string, day: string, cents: number, name: string) =>
        aTransaction().withId(id).on(day).withAmount(cents).withPaymentMethod('pix').withCounterparty(name).build();
      await transactions.saveMany([
        pixTo('nov', '2026-11-03', -1800, 'Empresa X'),
        pixTo('jun', '2026-06-10', -2100, 'Empresa X'),
        pixTo('jan', '2026-01-20', -900, 'Empresa X'),
        pixTo('refund', '2026-06-11', 2100, 'Empresa X'),
        pixTo('friend', '2026-06-10', -2100, 'Outra Pessoa'),
      ]);

      const result = await new CategorizeTransactionManually(transactions, categories, rules, categorizer).execute({
        transactionId: 'nov',
        categoryId: 'transporte.app',
      });

      expect(result.alsoApplied).toBe(3);
      expect((await transactions.findById('jun'))?.category).toEqual({
        categoryId: 'transporte.app',
        source: 'learned',
      });
      expect((await transactions.findById('jan'))?.category?.categoryId).toBe('transporte.app');
      expect((await transactions.findById('refund'))?.category?.categoryId).toBe('transporte.app-devolucao');
      expect((await transactions.findById('refund'))?.classification).toBe('expense');
      expect((await transactions.findById('friend'))?.category?.categoryId).not.toBe('transporte.app');
    });

    it('an incoming amount put into an expense category is a refund (reduces spending, not income)', async () => {
      await transactions.save(aTransaction().withId('back').withAmount(1500).withPaymentMethod('pix').build());

      await new CategorizeTransactionManually(transactions, categories, rules, categorizer).execute({
        transactionId: 'back',
        categoryId: 'transporte.app-devolucao',
      });

      const back = await transactions.findById('back');
      expect(back?.classification).toBe('expense');
      expect(back?.classificationSource).toBe('manual');
    });

    it('correcting the rides of a counterparty also turns its money back into refunds', async () => {
      const pixWith = (id: string, cents: number) =>
        aTransaction().withId(id).withAmount(cents).withPaymentMethod('pix').withCounterparty('Empresa X').build();
      await transactions.saveMany([
        pixWith('r1', -1500),
        pixWith('r2', -2300),
        pixWith('r3', -1800),
        pixWith('back', 1800),
      ]);

      await new CategorizeTransactionManually(transactions, categories, rules, categorizer).execute({
        transactionId: 'r1',
        categoryId: 'transporte.app',
      });

      const back = await transactions.findById('back');
      expect(back?.category?.categoryId).toBe('transporte.app-devolucao');
      expect(back?.classification).toBe('expense');
    });

    it('rejects unknown categories', async () => {
      await transactions.save(aTransaction().withId('t1').build());
      await expect(
        new CategorizeTransactionManually(transactions, categories, rules, categorizer).execute({
          transactionId: 't1',
          categoryId: 'nope',
        }),
      ).rejects.toThrow(UnknownCategoryError);
    });
  });
});
