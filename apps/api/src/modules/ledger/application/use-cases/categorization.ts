import { NotFoundError } from '../../../../shared/application/errors.js';
import type { IdGenerator } from '../../../../shared/application/id-generator.js';
import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import { CategorizationRule, type CategorizationRuleProps } from '../../domain/categorization/categorization-rule.js';
import type { Categorizer } from '../../domain/categorization/categorizer.js';
import { Category } from '../../domain/categorization/category.js';
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from '../../domain/categorization/default-taxonomy.js';
import { counterpartyIdentity, LearnedCategories } from '../../domain/categorization/learned-categories.js';
import type { CategorizationRuleRepository } from '../ports/categorization-rule-repository.js';
import type { CategoryRepository } from '../ports/category-repository.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

export class UnknownCategoryError extends NotFoundError {
  constructor(categoryId: string) {
    super(`categoria inexistente ou arquivada: ${categoryId}`);
  }
}

export class UnknownTransactionError extends NotFoundError {
  constructor(transactionId: string) {
    super(`transação inexistente: ${transactionId}`);
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
    const learned = LearnedCategories.from(await this.transactions.findManuallyCategorized());
    this.categorizer.categorize(transactions, await this.rules.findAll(), learned);
    const changed = transactions.filter((t) => t.category?.categoryId !== before.get(t.id));
    await this.transactions.saveMany(changed);
    return { ruleId: rule.id, affected: changed.length };
  }
}

/** Decisão do usuário sobre a categoria de uma transação: prevalece sobre qualquer automação. */
/**
 * A correção também ENSINA: as outras transações da mesma contraparte (mesmo sentido), em todos os
 * meses, passam a seguir a escolha, sem o usuário repetir mês a mês. Escolhas manuais nunca mudam.
 */
export class CategorizeTransactionManually {
  /** Até onde, para trás e para frente, a correção se propaga. */
  private static readonly REACH_MONTHS = 36;

  constructor(
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
    private readonly rules: CategorizationRuleRepository,
    private readonly categorizer: Categorizer,
  ) {}

  async execute(input: { transactionId: string; categoryId: string }): Promise<{ alsoApplied: number }> {
    await requireActiveCategory(this.categories, input.categoryId);
    const transaction = await this.transactions.findById(input.transactionId);
    if (!transaction) throw new UnknownTransactionError(input.transactionId);
    transaction.categorize(input.categoryId, 'manual');
    await this.transactions.save(transaction);

    const identity = counterpartyIdentity(transaction);
    if (!identity) return { alsoApplied: 0 };
    const reach = CategorizeTransactionManually.REACH_MONTHS;
    const sameCounterparty = (
      await this.transactions.findInPeriod({
        from: transaction.occurredOn.addMonths(-reach),
        to: transaction.occurredOn.addMonths(reach),
      })
    ).filter((t) => t.id !== transaction.id && counterpartyIdentity(t) === identity);
    const before = new Map(sameCounterparty.map((t) => [t.id, t.category?.categoryId]));
    const learned = LearnedCategories.from(await this.transactions.findManuallyCategorized());
    this.categorizer.categorize(sameCounterparty, await this.rules.findAll(), learned);
    const changed = sameCounterparty.filter((t) => t.category?.categoryId !== before.get(t.id));
    await this.transactions.saveMany(changed);
    return { alsoApplied: changed.length };
  }
}
