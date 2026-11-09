import type { CategorizationRule } from '../../domain/categorization/categorization-rule.js';

export abstract class CategorizationRuleRepository {
  abstract save(rule: CategorizationRule): Promise<void>;
  abstract findById(id: string): Promise<CategorizationRule | undefined>;
  abstract findAll(): Promise<CategorizationRule[]>;
  abstract delete(id: string): Promise<void>;
}
