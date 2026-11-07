import type { IdGenerator } from '../../../../shared/application/id-generator.js';
import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import { CategorizationRule, type CategorizationRuleProps } from '../../domain/categorization/categorization-rule.js';
import type { Categorizer } from '../../domain/categorization/categorizer.js';
import { Category } from '../../domain/categorization/category.js';
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from '../../domain/categorization/default-taxonomy.js';
import type { CategorizationRuleRepository } from '../ports/categorization-rule-repository.js';
import type { CategoryRepository } from '../ports/category-repository.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

export class UnknownCategoryError extends Error {
  constructor(categoryId: string) {
    super(`categoria inexistente ou arquivada: ${categoryId}`);
    this.name = 'UnknownCategoryError';
  }
}

export class UnknownTransactionError extends Error {
  constructor(transactionId: string) {
    super(`transação inexistente: ${transactionId}`);
    this.name = 'UnknownTransactionError';
  }
}

async function requireActiveCategory(categories: CategoryRepository, categoryId: string): Promise<Category> {
  const category = await categories.findById(categoryId);
  if (!category || category.archived) throw new UnknownCategoryError(categoryId);
  return category;
}

/** Cria a taxonomia e as regras padrão que ainda não existem. Nunca altera o que já existe. */
export class SeedDefaultCategorization {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly rules: CategorizationRuleRepository,
  ) {}

  async execute(): Promise<{ categoriesCreated: number; rulesCreated: number }> {
    const existing = new Set((await this.categories.findAll()).map((c) => c.id));
    let categoriesCreated = 0;
    for (const props of DEFAULT_CATEGORIES) {
      if (existing.has(props.id)) continue;
      await this.categories.save(Category.create(props));
      categoriesCreated++;
    }

    let rulesCreated = 0;
    for (const [index, props] of DEFAULT_RULES.entries()) {
      const id = `default-rule-${index + 1}`;
      if (await this.rules.findById(id)) continue;
      await this.rules.save(CategorizationRule.create({ id, ...props }));
      rulesCreated++;
    }
    return { categoriesCreated, rulesCreated };
  }
}

export interface CreateRuleInput {
  readonly rule: Omit<CategorizationRuleProps, 'id'>;
  /** Reaplica a categorização às transações deste período (inclusivo). */
  readonly applyTo?: { readonly from: LocalDate; readonly to: LocalDate };
}

/** Cria uma regra do usuário e, opcionalmente, recategoriza as transações existentes. */
export class CreateCategorizationRule {
  constructor(
    private readonly rules: CategorizationRuleRepository,
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly categorizer: Categorizer,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateRuleInput): Promise<{ ruleId: string; affected: number }> {
    await requireActiveCategory(this.categories, input.rule.categoryId);
    const rule = CategorizationRule.create({ id: this.ids.next(), ...input.rule });
    await this.rules.save(rule);
    if (!input.applyTo) return { ruleId: rule.id, affected: 0 };

    const transactions = await this.transactions.findInPeriod(input.applyTo);
    const before = new Map(transactions.map((t) => [t.id, t.category?.categoryId]));
    this.categorizer.categorize(transactions, await this.rules.findAll());
    const changed = transactions.filter((t) => t.category?.categoryId !== before.get(t.id));
    await this.transactions.saveMany(changed);
    return { ruleId: rule.id, affected: changed.length };
  }
}

/** Decisão do usuário sobre a categoria de uma transação: prevalece sobre qualquer automação. */
export class CategorizeTransactionManually {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(input: { transactionId: string; categoryId: string }): Promise<void> {
    await requireActiveCategory(this.categories, input.categoryId);
    const transaction = await this.transactions.findById(input.transactionId);
    if (!transaction) throw new UnknownTransactionError(input.transactionId);
    transaction.categorize(input.categoryId, 'manual');
    await this.transactions.save(transaction);
  }
}
