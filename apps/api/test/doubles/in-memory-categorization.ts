import { CategorizationRuleRepository } from '../../src/modules/ledger/application/ports/categorization-rule-repository.js';
import { CategoryRepository } from '../../src/modules/ledger/application/ports/category-repository.js';
import { CategorizationRule } from '../../src/modules/ledger/domain/categorization/categorization-rule.js';
import type { ProviderCategoryMap } from '../../src/modules/ledger/domain/categorization/categorizer.js';
import { Category } from '../../src/modules/ledger/domain/categorization/category.js';

export class InMemoryCategoryRepository extends CategoryRepository {
  private readonly rows = new Map<string, ReturnType<Category['snapshot']>>();
  async save(category: Category): Promise<void> {
    this.rows.set(category.id, category.snapshot());
  }
  async findById(id: string): Promise<Category | undefined> {
    const row = this.rows.get(id);
    return row ? Category.create(row) : undefined;
  }
  async findAll(): Promise<Category[]> {
    return [...this.rows.values()].map((row) => Category.create(row));
  }
}

export class InMemoryCategorizationRuleRepository extends CategorizationRuleRepository {
  private readonly rows = new Map<string, CategorizationRule['props']>();
  async save(rule: CategorizationRule): Promise<void> {
    this.rows.set(rule.id, { ...rule.props });
  }
  async findById(id: string): Promise<CategorizationRule | undefined> {
    const row = this.rows.get(id);
    return row ? CategorizationRule.create(row) : undefined;
  }
  async findAll(): Promise<CategorizationRule[]> {
    return [...this.rows.values()].map((row) => CategorizationRule.create(row));
  }
  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

/** Stub do mapa de categorias do provedor. */
export class StubProviderCategoryMap implements ProviderCategoryMap {
  constructor(private readonly map: Record<string, string> = {}) {}
  resolve(providerCategoryId: string): string | undefined {
    return this.map[providerCategoryId];
  }
}
