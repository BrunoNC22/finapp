import type { PaymentMethod, Transaction } from '../transaction.js';
import type { CategorizationRule } from './categorization-rule.js';
import { LearnedCategories } from './learned-categories.js';

/**
 * Porta: traduz a categoria sugerida pelo provedor de Open Finance para a taxonomia do app.
 * A implementação (com os ids do provedor) fica na infraestrutura.
 */
export interface ProviderCategoryMap {
  resolve(providerCategoryId: string): string | undefined;
}

export interface CategorizationReport {
  /** Aprendidas com correções manuais para a mesma contraparte. */
  readonly learned: number;
  readonly rule: number;
  readonly paymentMethod: number;
  readonly provider: number;
  readonly uncategorized: number;
  /** Transferências internas, ignoradas e categorias manuais. */
  readonly skipped: number;
}

/**
 * Categoria implícita pela forma de pagamento.
 * - STRONG vence o provedor: em dados reais o provedor rotula rendimento e cashback como
 *   "transferência para a mesma pessoa".
 * - FALLBACK só se aplica quando o provedor não sugere nada: para tarifas e juros, a categoria
 *   do provedor costuma ser mais específica (ex.: IOF → impostos).
 */
const STRONG_BY_PAYMENT_METHOD: Partial<Record<PaymentMethod, string>> = {
  yield: 'renda.rendimentos',
  cashback: 'renda.cashback',
};
const FALLBACK_BY_PAYMENT_METHOD: Partial<Record<PaymentMethod, string>> = {
  fee: 'financeiro.tarifas',
  interest: 'financeiro.juros',
};

/**
 * Atribui categorias com a precedência:
 * manual > aprendida das correções manuais > regra > forma de pagamento (forte) > provedor > forma (fallback).
 * A aprendida vem antes das regras: é a decisão do próprio usuário sobre AQUELA contraparte.
 * Recalcula do zero o que não é manual: mudar ou apagar uma regra reflete na próxima execução.
 */
export class Categorizer {
  constructor(private readonly providerMap: ProviderCategoryMap) {}

  categorize(
    transactions: readonly Transaction[],
    rules: readonly CategorizationRule[],
    learned: LearnedCategories = LearnedCategories.none(),
  ): CategorizationReport {
    const ordered = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
    const report = { learned: 0, rule: 0, paymentMethod: 0, provider: 0, uncategorized: 0, skipped: 0 };

    for (const transaction of transactions) {
      if (transaction.classification === 'internal_transfer' || transaction.classification === 'ignored') {
        transaction.clearAutomaticCategory();
        report.skipped++;
        continue;
      }
      if (transaction.category?.source === 'manual') {
        report.skipped++;
        continue;
      }
      transaction.clearAutomaticCategory();

      const fromCorrections = learned.categoryFor(transaction);
      if (fromCorrections) {
        transaction.categorize(fromCorrections, 'learned');
        report.learned++;
        continue;
      }
      const rule = ordered.find((r) => r.matches(transaction));
      if (rule) {
        transaction.categorize(rule.categoryId, 'rule');
        report.rule++;
        continue;
      }
      const strong = STRONG_BY_PAYMENT_METHOD[transaction.paymentMethod];
      if (strong) {
        transaction.categorize(strong, 'rule');
        report.paymentMethod++;
        continue;
      }
      const fromProvider = transaction.providerCategoryId && this.providerMap.resolve(transaction.providerCategoryId);
      if (fromProvider) {
        transaction.categorize(fromProvider, 'provider');
        report.provider++;
        continue;
      }
      const fallback = FALLBACK_BY_PAYMENT_METHOD[transaction.paymentMethod];
      if (fallback) {
        transaction.categorize(fallback, 'rule');
        report.paymentMethod++;
        continue;
      }
      report.uncategorized++;
    }
    return report;
  }
}
