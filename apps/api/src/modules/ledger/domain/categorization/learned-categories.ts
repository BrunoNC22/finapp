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

/** Diferença de valor (relativa) para uma correção valer como exemplo "do mesmo tipo". */
const SAME_AMOUNT_TOLERANCE = 0.1;

interface Example {
  readonly categoryId: string;
  readonly cents: number;
  readonly refund: boolean;
}

/**
 * Categorias aprendidas com as correções manuais do usuário: a escolha feita para uma transação vale para as
 * outras da mesma contraparte, em todos os meses. Se a mesma contraparte tem usos diferentes (ex.: Pix para a
 * mãe de 350 = aluguel, de 120 = conta de luz), vale a correção de VALOR mais próximo (±10%); longe de todas,
 * vale a maioria; empate não ensina nada.
 */
export class LearnedCategories {
  private constructor(private readonly byIdentity: ReadonlyMap<string, readonly Example[]>) {}

  static none(): LearnedCategories {
    return new LearnedCategories(new Map());
  }

  static from(examples: readonly Transaction[]): LearnedCategories {
    const byIdentity = new Map<string, Example[]>();
    for (const t of examples) {
      if (t.category?.source !== 'manual') continue;
      if (t.classification === 'internal_transfer' || t.classification === 'ignored') continue;
      const identity = counterpartyIdentity(t);
      if (!identity) continue;
      const list = byIdentity.get(identity) ?? [];
      list.push({ categoryId: t.category.categoryId, cents: Math.abs(t.amount.cents), refund: t.isRefund });
      byIdentity.set(identity, list);
    }
    return new LearnedCategories(byIdentity);
  }

  decisionFor(t: Transaction): LearnedDecision | undefined {
    const identity = counterpartyIdentity(t);
    const examples = identity ? this.byIdentity.get(identity) : undefined;
    if (!examples?.length) return undefined;
    const cents = Math.abs(t.amount.cents);
    const distance = (e: Example) => Math.abs(e.cents - cents) / Math.max(e.cents, cents, 1);
    const near = examples.filter((e) => distance(e) <= SAME_AMOUNT_TOLERANCE);
    if (near.length) {
      const closest = Math.min(...near.map(distance));
      const winner = majority(near.filter((e) => distance(e) === closest));
      if (winner) return winner;
    }
    return majority(examples);
  }

  categoryFor(t: Transaction): string | undefined {
    return this.decisionFor(t)?.categoryId;
  }
}

/** Categoria com mais exemplos (estritamente); empate → nenhuma. */
function majority(examples: readonly Example[]): LearnedDecision | undefined {
  const counts = new Map<string, number>();
  for (const e of examples) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
  const [first, second] = [...counts].sort((a, b) => b[1] - a[1]);
  if (!first || (second && second[1] === first[1])) return undefined;
  return { categoryId: first[0], refund: examples.some((e) => e.categoryId === first[0] && e.refund) };
}
