import { NotFoundError } from '../../../../shared/application/errors.js';
import type { IdGenerator } from '../../../../shared/application/id-generator.js';
import { DomainError } from '../../../../shared/kernel/domain-error.js';
import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import { CategorizationRule, type CategorizationRuleProps } from '../../domain/categorization/categorization-rule.js';
import type { Categorizer } from '../../domain/categorization/categorizer.js';
import { Category } from '../../domain/categorization/category.js';
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from '../../domain/categorization/default-taxonomy.js';
import { counterpartyKey, LearnedCategories } from '../../domain/categorization/learned-categories.js';
import type { Transaction } from '../../domain/transaction.js';
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

export class UnknownRuleError extends NotFoundError {
  constructor(ruleId: string) {
    super(`regra inexistente: ${ruleId}`);
  }
}

export class DefaultRuleCannotBeDeletedError extends DomainError {
  constructor() {
    super('regra padrão não pode ser excluída (ela volta no próximo boot): desligue-a');
  }
}

type Period = { readonly from: LocalDate; readonly to: LocalDate };
type RuleInput = Omit<CategorizationRuleProps, 'id'>;
/** Campos a mudar numa regra; `null` remove uma condição. */
export type RuleChanges = { readonly [K in keyof RuleInput]?: RuleInput[K] | null };

/**
 * Recategoriza o período com as regras dadas (escolhas manuais nunca mudam) e diz o que mudou de categoria.
 * `save: false` é a prévia: as transações carregadas são alteradas só em memória.
 */
async function reapply(
  transactions: TransactionRepository,
  categorizer: Categorizer,
  rules: readonly CategorizationRule[],
  period: Period,
  save: boolean,
): Promise<{ changed: Transaction[]; previous: Map<string, string | undefined> }> {
  const list = await transactions.findInPeriod(period);
  const previous = new Map(list.map((t) => [t.id, t.category?.categoryId]));
  const signature = (t: Transaction) => `${t.category?.categoryId}|${t.category?.source}|${t.classification}`;
  const before = new Map(list.map((t) => [t.id, signature(t)]));
  const learned = LearnedCategories.from(await transactions.findManuallyCategorized());
  categorizer.categorize(list, [...rules], learned);
  // Salva também quando só a ORIGEM mudou (ex.: regra desligada e o provedor sugere a mesma categoria),
  // senão a transação continuaria "categorizada por regra". "Afetadas" = as que mudaram de categoria.
  if (save) await transactions.saveMany(list.filter((t) => signature(t) !== before.get(t.id)));
  const changed = list.filter((t) => t.category?.categoryId !== previous.get(t.id));
  return { changed, previous };
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

    const { changed } = await reapply(
      this.transactions,
      this.categorizer,
      await this.rules.findAll(),
      input.applyTo,
      true,
    );
    return { ruleId: rule.id, affected: changed.length };
  }
}

/** Prévia de impacto: quantas transações a regra (nova ou editada) mudaria, com exemplos. Não salva nada. */
export class PreviewCategorizationRule {
  constructor(
    private readonly rules: CategorizationRuleRepository,
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly categorizer: Categorizer,
  ) {}

  /** `replacing`: id da regra que a prévia substitui (edição). */
  async execute(
    input: RuleInput,
    period: Period,
    replacing?: string,
  ): Promise<{
    affected: number;
    examples: { description: string; occurredOn: string; from: string | null }[];
  }> {
    await requireActiveCategory(this.categories, input.categoryId);
    const candidate = CategorizationRule.create({ id: replacing ?? '__previa__', ...input });
    const others = (await this.rules.findAll()).filter((r) => r.id !== replacing);
    const { changed, previous } = await reapply(
      this.transactions,
      this.categorizer,
      [...others, candidate],
      period,
      false,
    );
    const examples = [...changed]
      .sort((a, b) => b.occurredOn.toString().localeCompare(a.occurredOn.toString()))
      .slice(0, 5)
      .map((t) => ({
        description: t.description,
        occurredOn: t.occurredOn.toString(),
        from: previous.get(t.id) ?? null,
      }));
    return { affected: changed.length, examples };
  }
}

/** Edita uma regra (ligar/desligar, prioridade, categoria, condições) e reaplica ao período. */
export class UpdateCategorizationRule {
  constructor(
    private readonly rules: CategorizationRuleRepository,
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly categorizer: Categorizer,
  ) {}

  async execute(
    id: string,
    changes: RuleChanges,
    period: Period,
  ): Promise<{ rule: CategorizationRule; affected: number }> {
    const existing = await this.rules.findById(id);
    if (!existing) throw new UnknownRuleError(id);
    if (changes.categoryId) await requireActiveCategory(this.categories, changes.categoryId);
    const merged: Record<string, unknown> = { ...existing.props };
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) delete merged[key];
      else if (value !== undefined) merged[key] = value;
    }
    const rule = CategorizationRule.create(merged as unknown as CategorizationRuleProps);
    await this.rules.save(rule);
    const { changed } = await reapply(this.transactions, this.categorizer, await this.rules.findAll(), period, true);
    return { rule, affected: changed.length };
  }
}

/** Exclui uma regra do usuário e desfaz o efeito dela no período. Regras padrão só podem ser desligadas. */
export class DeleteCategorizationRule {
  constructor(
    private readonly rules: CategorizationRuleRepository,
    private readonly transactions: TransactionRepository,
    private readonly categorizer: Categorizer,
  ) {}

  async execute(id: string, period: Period): Promise<{ affected: number }> {
    if (id.startsWith('default-rule-')) throw new DefaultRuleCannotBeDeletedError();
    if (!(await this.rules.findById(id))) throw new UnknownRuleError(id);
    await this.rules.delete(id);
    const { changed } = await reapply(this.transactions, this.categorizer, await this.rules.findAll(), period, true);
    return { affected: changed.length };
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
    const category = await requireActiveCategory(this.categories, input.categoryId);
    const transaction = await this.transactions.findById(input.transactionId);
    if (!transaction) throw new UnknownTransactionError(input.transactionId);
    transaction.categorize(input.categoryId, 'manual');
    // Entrada numa categoria de gasto é devolução: reduz o gasto e não conta como renda.
    if (transaction.direction === 'inflow' && category.kind === 'expense' && transaction.classification === 'income') {
      transaction.classifyManually('expense');
    }
    await this.transactions.save(transaction);

    // Mesma contraparte nos dois sentidos: corrigir as corridas também reavalia as devoluções delas.
    const key = counterpartyKey(transaction);
    if (!key) return { alsoApplied: 0 };
    const reach = CategorizeTransactionManually.REACH_MONTHS;
    const sameCounterparty = (
      await this.transactions.findInPeriod({
        from: transaction.occurredOn.addMonths(-reach),
        to: transaction.occurredOn.addMonths(reach),
      })
    ).filter((t) => t.id !== transaction.id && counterpartyKey(t) === key);
    const before = new Map(sameCounterparty.map((t) => [t.id, `${t.category?.categoryId}|${t.classification}`]));
    const learned = LearnedCategories.from(await this.transactions.findManuallyCategorized());
    // A propria transação entra como evidência (ex.: mais um pagamento) mas não é alterada (é manual).
    this.categorizer.categorize([transaction, ...sameCounterparty], await this.rules.findAll(), learned);
    const changed = sameCounterparty.filter(
      (t) => `${t.category?.categoryId}|${t.classification}` !== before.get(t.id),
    );
    await this.transactions.saveMany(changed);
    return { alsoApplied: changed.length };
  }
}
