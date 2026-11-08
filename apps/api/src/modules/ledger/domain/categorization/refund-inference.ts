import type { Transaction } from '../transaction.js';
import { REFUND_CATEGORY_FOR } from './default-taxonomy.js';
import { counterpartyKey } from './learned-categories.js';

/** Pagamentos mínimos para um recebimento daquela contraparte ser lido como devolução. */
const MIN_PAYMENTS = 3;

interface PaymentStats {
  readonly byCategory: Map<string, number>;
  count: number;
  largestCents: number;
}

/**
 * Dinheiro que VOLTA de quem o usuário costuma pagar é devolução (ex.: corrida paga antes e cancelada),
 * não renda. Exige histórico de pagamentos (≥ 3, a maioria numa categoria) e que o valor devolvido não
 * passe do maior pagamento feito: um cliente que o usuário pagou uma vez continua sendo renda.
 */
export class RefundInference {
  private constructor(private readonly payments: ReadonlyMap<string, PaymentStats>) {}

  static from(transactions: readonly Transaction[]): RefundInference {
    const payments = new Map<string, PaymentStats>();
    for (const t of transactions) {
      if (t.direction !== 'outflow' || t.classification !== 'expense' || !t.category) continue;
      const key = counterpartyKey(t);
      if (!key) continue;
      const stats = payments.get(key) ?? { byCategory: new Map(), count: 0, largestCents: 0 };
      stats.byCategory.set(t.category.categoryId, (stats.byCategory.get(t.category.categoryId) ?? 0) + 1);
      stats.count++;
      stats.largestCents = Math.max(stats.largestCents, -t.amount.cents);
      payments.set(key, stats);
    }
    return new RefundInference(payments);
  }

  /** Categoria da devolução, ou undefined se não há evidência suficiente. */
  categoryFor(inflow: Transaction): string | undefined {
    if (inflow.direction !== 'inflow') return undefined;
    const key = counterpartyKey(inflow);
    const stats = key ? this.payments.get(key) : undefined;
    if (!stats || stats.count < MIN_PAYMENTS || inflow.amount.cents > stats.largestCents) return undefined;
    const [main] = [...stats.byCategory].sort((a, b) => b[1] - a[1]);
    if (!main || main[1] * 2 <= stats.count) return undefined;
    return REFUND_CATEGORY_FOR[main[0]] ?? main[0];
  }
}
