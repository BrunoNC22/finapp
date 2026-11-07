import type { Document } from '../../../../shared/kernel/document.js';
import type { Account } from '../account.js';
import type { Transaction } from '../transaction.js';

export interface MatcherOptions {
  /** Distância máxima, em dias, entre as pontas de uma transferência. */
  readonly transferWindowDays: number;
  /** Distância máxima entre o pagamento da fatura e o crédito no cartão. */
  readonly billPaymentWindowDays: number;
}

export interface TransferPair {
  readonly outflowId: string;
  readonly inflowId: string;
  readonly reason: 'transfer' | 'bill_payment';
}

export interface MatchReport {
  readonly pairs: TransferPair[];
  /** Transferências para/de documento próprio sem a outra ponta (conta não conectada ou histórico mais curto). */
  readonly unpaired: { readonly transactionId: string; readonly reason: 'own_document' }[];
  /** Saídas com mais de um par igualmente provável: não ligadas, ficam para revisão. */
  readonly ambiguous: { readonly transactionId: string; readonly candidateIds: string[] }[];
  /** Transações que já estavam ligadas antes desta execução. */
  readonly alreadyLinked: number;
}

const DEFAULT_OPTIONS: MatcherOptions = { transferWindowDays: 3, billPaymentWindowDays: 5 };

/**
 * Concilia transferências entre contas do próprio usuário, para que o mesmo dinheiro não conte
 * como renda e gasto várias vezes (ex.: PJ → carteira → banco → fatura do cartão).
 *
 * Regras (validadas com dados reais de Open Finance):
 * - "Contraparte = eu" só vale para operações de transferência (Pix, TED/DOC). Bancos colocam o
 *   documento do titular em tarifas, corridas e débitos de fatura, e esses lançamentos continuam gasto.
 * - Uma transferência para o próprio documento é interna mesmo sem par (outra ponta não conectada
 *   ou histórico começando em datas diferentes). O par só LIGA as pontas.
 * - Com documento informado, ele precisa bater com o TITULAR da conta da outra ponta. Isso desempata
 *   cadeias no mesmo dia (PJ → PF: quem recebe na conta PF viu o CNPJ pagando).
 * - Empate entre candidatos igualmente prováveis: não liga e reporta como ambíguo.
 * - Decisões manuais e ligações existentes nunca são alteradas (idempotente).
 */
export class InternalTransferMatcher {
  constructor(private readonly options: MatcherOptions = DEFAULT_OPTIONS) {}

  match(transactions: readonly Transaction[], accounts: readonly Account[]): MatchReport {
    const context = new MatchContext(accounts);
    const alreadyLinked = transactions.filter((t) => t.transferLink !== undefined).length;
    const open = transactions.filter((t) => t.transferLink === undefined && t.classificationSource !== 'manual');

    const outflows = open
      .filter((t) => t.direction === 'outflow' && context.canBeTransferSide(t))
      .sort((a, b) => a.occurredOn.toString().localeCompare(b.occurredOn.toString()) || a.id.localeCompare(b.id));
    const inflows = open.filter((t) => t.direction === 'inflow' && context.canBeTransferSide(t));

    const pairs: TransferPair[] = [];
    const ambiguous: MatchReport['ambiguous'] = [];
    const used = new Set<string>();

    for (const outflow of outflows) {
      const candidates = inflows
        .filter((inflow) => !used.has(inflow.id) && this.isPossiblePair(outflow, inflow, context))
        .map((inflow) => ({ inflow, distance: outflow.occurredOn.daysBetween(inflow.occurredOn) }));
      if (candidates.length === 0) continue;

      const best = Math.min(...candidates.map((c) => c.distance));
      const closest = candidates.filter((c) => c.distance === best).map((c) => c.inflow);
      if (closest.length > 1) {
        ambiguous.push({ transactionId: outflow.id, candidateIds: closest.map((t) => t.id).sort() });
        continue;
      }

      const [inflow] = closest as [Transaction];
      outflow.markAsInternalTransfer(inflow.id);
      inflow.markAsInternalTransfer(outflow.id);
      used.add(inflow.id);
      pairs.push({
        outflowId: outflow.id,
        inflowId: inflow.id,
        reason: context.isCardBillCredit(inflow) ? 'bill_payment' : 'transfer',
      });
    }

    const unpaired: MatchReport['unpaired'] = [];
    for (const transaction of open) {
      if (transaction.transferLink !== undefined) continue;
      if (context.isTransferOperation(transaction) && context.involvesOwnDocument(transaction)) {
        transaction.markAsInternalTransfer();
        unpaired.push({ transactionId: transaction.id, reason: 'own_document' });
      }
    }

    return { pairs, unpaired, ambiguous, alreadyLinked };
  }

  private isPossiblePair(outflow: Transaction, inflow: Transaction, context: MatchContext): boolean {
    if (outflow.accountId === inflow.accountId) return false;
    if (!outflow.amount.negate().equals(inflow.amount)) return false;

    const billPayment = context.isCardBillCredit(inflow);
    const window = billPayment ? this.options.billPaymentWindowDays : this.options.transferWindowDays;
    if (outflow.occurredOn.daysBetween(inflow.occurredOn) > window) return false;

    // Com documento informado, ele precisa ser o do titular da conta da outra ponta.
    if (!context.documentFits(inflow.counterparty?.document, outflow.accountId)) return false;
    if (!context.documentFits(outflow.counterparty?.document, inflow.accountId)) return false;

    if (billPayment) return outflow.paymentMethod === 'bill_payment' || context.involvesOwnDocument(outflow);
    return context.involvesOwnDocument(outflow) || context.involvesOwnDocument(inflow);
  }
}

/** Conhecimento sobre as contas do usuário usado durante uma conciliação. */
class MatchContext {
  private readonly accountsById: Map<string, Account>;
  private readonly ownDocuments: Document[];

  constructor(accounts: readonly Account[]) {
    this.accountsById = new Map(accounts.map((a) => [a.id, a]));
    this.ownDocuments = accounts.map((a) => a.holderDocument);
  }

  isTransferOperation(t: Transaction): boolean {
    return t.paymentMethod === 'pix' || t.paymentMethod === 'ted_doc';
  }

  isCardBillCredit(t: Transaction): boolean {
    return (
      t.direction === 'inflow' &&
      t.paymentMethod === 'bill_payment' &&
      !!this.accountsById.get(t.accountId)?.isCreditCard
    );
  }

  involvesOwnDocument(t: Transaction): boolean {
    const document = t.counterparty?.document;
    return !!document && this.ownDocuments.some((own) => own.isSameAs(document));
  }

  /** Pode ser uma ponta: transferência (sem documento ou com documento próprio) ou pagamento de fatura. */
  canBeTransferSide(t: Transaction): boolean {
    if (t.paymentMethod === 'bill_payment') return true;
    if (!this.isTransferOperation(t)) return false;
    const document = t.counterparty?.document;
    return !document || document.isMasked || this.involvesOwnDocument(t);
  }

  /** Sem documento (ou mascarado) não restringe; com documento completo, precisa ser o titular da conta. */
  documentFits(document: Document | undefined, accountId: string): boolean {
    if (!document || document.isMasked) return true;
    const holder = this.accountsById.get(accountId)?.holderDocument;
    return !holder || holder.isSameAs(document);
  }
}
