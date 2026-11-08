import { normalizeMerchant, withoutGatewayPrefix } from '../services/installment-grouper.js';
import type { PaymentMethod, Transaction } from '../transaction.js';
import { foldText } from './categorization-rule.js';

/** Formas cuja descrição é genérica ("Pix enviado"): sem contraparte, não há o que aprender. */
const GENERIC_DESCRIPTION: ReadonlySet<PaymentMethod> = new Set(['pix', 'ted_doc', 'boleto']);

/**
 * Quem está do outro lado, nos dois sentidos:
 * documento completo (CPF pela base de 9 dígitos) > nome da contraparte > estabelecimento (cartão).
 * Só existe em memória: nunca é persistida nem exposta.
 */
export function counterpartyKey(t: Transaction): string | undefined {
  const document = t.counterparty?.document;
  const name = t.counterparty?.name?.trim();
  let who: string | undefined;
  if (document && !document.isMasked) {
    who = `doc:${document.type === 'CPF' ? document.value.slice(0, 9) : document.value}`;
  } else if (name) {
    who = `name:${foldText(name).replace(/\s+/g, ' ')}`;
  } else if (!GENERIC_DESCRIPTION.has(t.paymentMethod)) {
    const merchant = withoutGatewayPrefix(normalizeMerchant(t.description));
    who = merchant ? `m:${merchant}` : undefined;
  }
  return who;
}

/** A contraparte no MESMO sentido (gasto ou entrada): o que se aprende de um não vale para o outro. */
export function counterpartyIdentity(t: Transaction): string | undefined {
  if (t.direction === 'none') return undefined;
  const key = counterpartyKey(t);
  return key ? `${t.direction}|${key}` : undefined;
}

export interface LearnedDecision {
  readonly categoryId: string;
  /** Entrada que o usuário tratou como devolução (gasto negativo), não como renda. */
  readonly refund: boolean;
}

/**
 * Categorias aprendidas com as correções manuais do usuário: a escolha feita para uma transação
 * vale para as outras da mesma contraparte, em todos os meses. Vence a maioria; empate não ensina nada.
 */
export class LearnedCategories {
  private constructor(private readonly byIdentity: ReadonlyMap<string, LearnedDecision>) {}

  static none(): LearnedCategories {
    return new LearnedCategories(new Map());
  }

  static from(examples: readonly Transaction[]): LearnedCategories {
    const votes = new Map<string, Map<string, number>>();
    const refunds = new Set<string>();
    for (const t of examples) {
      if (t.category?.source !== 'manual') continue;
      if (t.classification === 'internal_transfer' || t.classification === 'ignored') continue;
      const identity = counterpartyIdentity(t);
      if (!identity) continue;
      const counts = votes.get(identity) ?? new Map<string, number>();
      counts.set(t.category.categoryId, (counts.get(t.category.categoryId) ?? 0) + 1);
      votes.set(identity, counts);
      if (t.isRefund) refunds.add(`${identity}#${t.category.categoryId}`);
    }
    const learned = new Map<string, LearnedDecision>();
    for (const [identity, counts] of votes) {
      const ranked = [...counts].sort((a, b) => b[1] - a[1]);
      const [first, second] = ranked;
      if (first && (!second || first[1] > second[1])) {
        learned.set(identity, { categoryId: first[0], refund: refunds.has(`${identity}#${first[0]}`) });
      }
    }
    return new LearnedCategories(learned);
  }

  decisionFor(t: Transaction): LearnedDecision | undefined {
    const identity = counterpartyIdentity(t);
    return identity ? this.byIdentity.get(identity) : undefined;
  }

  categoryFor(t: Transaction): string | undefined {
    return this.decisionFor(t)?.categoryId;
  }
}
