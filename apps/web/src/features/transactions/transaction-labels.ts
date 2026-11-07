import type { TransactionDto } from '@finapp/contracts';

export type BadgeTone = 'pix' | 'card' | 'installment' | 'transfer' | 'bill' | 'income' | 'fee' | 'neutral';

export interface Badge {
  readonly label: string;
  readonly tone: BadgeTone;
}

const BY_METHOD: Record<TransactionDto['paymentMethod'], Badge> = {
  pix: { label: 'Pix', tone: 'pix' },
  ted_doc: { label: 'TED/DOC', tone: 'neutral' },
  boleto: { label: 'Boleto', tone: 'neutral' },
  card_purchase: { label: 'À vista', tone: 'card' },
  bill_payment: { label: 'Fatura', tone: 'bill' },
  fee: { label: 'Tarifa', tone: 'fee' },
  interest: { label: 'Juros', tone: 'fee' },
  yield: { label: 'Rendimento', tone: 'income' },
  cashback: { label: 'Cashback', tone: 'income' },
  refund: { label: 'Estorno', tone: 'income' },
  other: { label: 'Outro', tone: 'neutral' },
};

/** Selo da forma de pagamento: Pix, à vista, parcela k/n, transferência interna, fatura… (nada para "outro"). */
export function paymentBadge(t: TransactionDto): Badge | undefined {
  if (t.paymentMethod === 'bill_payment') return BY_METHOD.bill_payment;
  if (t.classification === 'internal_transfer') return { label: 'Entre contas', tone: 'transfer' };
  if (t.installment) return { label: `Parcela ${t.installment.number}/${t.installment.total}`, tone: 'installment' };
  return t.paymentMethod === 'other' ? undefined : BY_METHOD[t.paymentMethod];
}

export const CLASSIFICATION_LABEL: Record<TransactionDto['classification'], string> = {
  income: 'Entrada',
  expense: 'Gasto',
  internal_transfer: 'Transferência entre suas contas',
  ignored: 'Ignorada nos relatórios',
};

export const PAYMENT_METHOD_LABEL: Record<TransactionDto['paymentMethod'], string> = {
  pix: 'Pix',
  ted_doc: 'TED/DOC',
  boleto: 'Boleto',
  card_purchase: 'Compra no cartão',
  bill_payment: 'Pagamento de fatura',
  fee: 'Tarifa',
  interest: 'Juros',
  yield: 'Rendimento',
  cashback: 'Cashback',
  refund: 'Estorno',
  other: 'Outro',
};

/** Por que a transação está assim: origem da categoria e da classificação, em linguagem simples. */
export function explain(t: TransactionDto): string[] {
  const reasons: string[] = [];
  switch (t.category?.source) {
    case 'manual':
      reasons.push('Categoria escolhida por você.');
      break;
    case 'rule':
      reasons.push('Categoria definida por uma regra sua.');
      break;
    case 'provider':
      reasons.push('Categoria sugerida pelo banco (Open Finance).');
      break;
    default:
      reasons.push('Ainda sem categoria.');
  }
  switch (t.classificationSource) {
    case 'manual':
      reasons.push(`Classificada por você como "${CLASSIFICATION_LABEL[t.classification].toLowerCase()}".`);
      break;
    case 'matcher':
      reasons.push(
        t.paymentMethod === 'bill_payment'
          ? 'Pagamento da fatura de um cartão seu: não conta como gasto (as compras do cartão já contam).'
          : 'Dinheiro que saiu de uma conta sua e entrou em outra sua: não conta como gasto nem renda.',
      );
      break;
    default:
      reasons.push(
        t.classification === 'income' ? 'Entrada (valor positivo).' : 'Gasto (valor negativo, saiu da conta).',
      );
  }
  if (t.installment?.totalAmountIsEstimated) {
    reasons.push('O total da compra parcelada é estimado (parcela × número de parcelas).');
  }
  if (t.status === 'pending') reasons.push('Ainda pendente no banco: o valor pode mudar.');
  return reasons;
}
