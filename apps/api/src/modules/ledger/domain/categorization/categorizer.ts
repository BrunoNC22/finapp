import type { PaymentMethod, Transaction } from '../transaction.js';
import type { CategorizationRule } from './categorization-rule.js';
import { LearnedCategories } from './learned-categories.js';
import { RefundInference } from './refund-inference.js';

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
  /** Entradas reconhecidas como devolução de um gasto (não contam como renda). */
  readonly refund: number;
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
 * manual > aprendida das correções manuais > devolução > regra > forma de pagamento (forte) > provedor >
 * forma (fallback). A aprendida vem antes das regras: é a decisão do próprio usuário sobre AQUELA contraparte.
 * Recalcula do zero o que não é manual: mudar ou apagar uma regra reflete na próxima execução.
 *
 * Em duas fases: primeiro saídas (e o resto), depois entradas, que podem ser devoluções de quem o usuário
 * paga (a evidência vem das saídas já categorizadas nesta execução).
 */
export class Categorizer {
  constructor(private readonly providerMap: ProviderCategoryMap) {}

  categorize(
    transactions: readonly Transaction[],
    rules: readonly CategorizationRule[],
    learned: LearnedCategories = LearnedCategories.none(),
  ): CategorizationReport {
    const ordered = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
    const report = { learned: 0, refund: 0, rule: 0, paymentMethod: 0, provider: 0, uncategorized: 0, skipped: 0 };
    for (const t of transactions) t.resetAutomaticClassification();

    for (const t of transactions.filter((x) => x.direction !== 'inflow'))
      this.one(t, ordered, learned, undefined, report);
    const refunds = RefundInference.from(transactions);
    for (const t of transactions.filter((x) => x.direction === 'inflow'))
      this.one(t, ordered, learned, refunds, report);
    return report;
  }

  private one(
    transaction: Transaction,
    rules: readonly CategorizationRule[],
    learned: LearnedCategories,
    refunds: RefundInference | undefined,
    report: { -readonly [K in keyof CategorizationReport]: number },
  ): void {
    if (transaction.classification === 'internal_transfer' || transaction.classification === 'ignored') {
      transaction.clearAutomaticCategory();
      report.skipped++;
      return;
    }
    if (transaction.category?.source === 'manual') {
      report.skipped++;
      return;
    }
    transaction.clearAutomaticCategory();

    const fromCorrections = learned.decisionFor(transaction);
    if (fromCorrections) {
      transaction.categorize(fromCorrections.categoryId, 'learned');
      if (fromCorrections.refund) transaction.markAsRefund();
      report.learned++;
      return;
    }
    const refundOf = refunds?.categoryFor(transaction);
    if (refundOf && transaction.classification === 'income') {
      transaction.categorize(refundOf, 'rule');
      transaction.markAsRefund();
      report.refund++;
      return;
    }
    const rule = rules.find((r) => r.matches(transaction));
    if (rule) {
      transaction.categorize(rule.categoryId, 'rule');
      report.rule++;
      return;
    }
    const strong = STRONG_BY_PAYMENT_METHOD[transaction.paymentMethod];
    if (strong) {
      transaction.categorize(strong, 'rule');
      report.paymentMethod++;
      return;
    }
    const fromProvider = transaction.providerCategoryId && this.providerMap.resolve(transaction.providerCategoryId);
    if (fromProvider) {
      transaction.categorize(fromProvider, 'provider');
      report.provider++;
      return;
    }
    const fallback = FALLBACK_BY_PAYMENT_METHOD[transaction.paymentMethod];
    if (fallback) {
      transaction.categorize(fallback, 'rule');
      report.paymentMethod++;
      return;
    }
    report.uncategorized++;
  }
}
