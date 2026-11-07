import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import type { ProviderAccount, ProviderTransaction } from '../../application/ports/open-finance-provider.js';
import type { PaymentMethod } from '../../domain/transaction.js';
import type { PluggyAccount, PluggyParticipant, PluggyTransaction } from './pluggy-types.js';

/**
 * Tradução Pluggy → domínio. Cada regra aqui foi validada contra dados reais de Open Finance
 * (sem que esses dados entrem no repositório).
 */

const toCents = (reais: number): Money => Money.fromCents(Math.round(reais * 100));

const titleCase = (text: string): string =>
  text
    .toLowerCase()
    .replace(/(^|[\s(])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase())
    .replace(/\bS\.a\./g, 'S.A.');

/** No Meu Pluggy, todo item usa o conector "MeuPluggy": a instituição vem do nome da conta bancária. */
export function institutionNameOf(itemAccounts: readonly PluggyAccount[]): string {
  const bank = itemAccounts.find((a) => a.type === 'BANK') ?? itemAccounts[0];
  return bank ? titleCase(bank.name.trim()) : 'Instituição';
}

/** Cartões vêm sem `taxNumber`: herdam o do titular da conta bancária do mesmo item. */
export function holderDocumentOf(account: PluggyAccount, itemAccounts: readonly PluggyAccount[]): string {
  const document = account.taxNumber ?? itemAccounts.find((a) => a.taxNumber)?.taxNumber;
  if (!document) throw new Error('a conta não informa o documento do titular, nem outra conta da mesma conexão');
  return document;
}

export function mapAccount(account: PluggyAccount, itemAccounts: readonly PluggyAccount[]): ProviderAccount {
  const isCard = account.type === 'CREDIT';
  const limit = account.creditData?.creditLimit;
  return {
    externalId: account.id,
    connectionId: account.itemId,
    institutionName: institutionNameOf(itemAccounts),
    name: isCard ? account.name.trim() : '',
    kind: isCard ? 'credit_card' : account.subtype === 'SAVINGS_ACCOUNT' ? 'savings' : 'checking',
    holderDocument: holderDocumentOf(account, itemAccounts),
    // No cartão, o saldo é o limite usado: uma dívida.
    balance: isCard ? toCents(account.balance).negate() : toCents(account.balance),
    ...(isCard && typeof limit === 'number' ? { creditLimit: toCents(limit) } : {}),
  };
}

export function mapTransaction(t: PluggyTransaction, account: PluggyAccount, timeZone: string): ProviderTransaction {
  const isCard = account.type === 'CREDIT';
  // Convenção do domínio: negativo = dinheiro saindo do usuário. No cartão, a Pluggy usa o sinal oposto.
  const amount = isCard ? toCents(t.amount).negate() : toCents(t.amount);
  const description = (t.description ?? t.descriptionRaw ?? '').trim();
  const paymentMethod = isCard ? cardPaymentMethod(t, amount, description) : bankPaymentMethod(t, description);
  const participant = amount.isNegative() ? t.paymentData?.receiver : t.paymentData?.payer;
  const counterparty = toCounterparty(participant);
  const meta = t.creditCardMetadata;
  const installment =
    isCard &&
    paymentMethod === 'card_purchase' &&
    meta?.totalInstallments &&
    meta.totalInstallments > 1 &&
    meta.installmentNumber
      ? {
          number: meta.installmentNumber,
          total: meta.totalInstallments,
          ...(typeof meta.totalAmount === 'number' ? { totalAmount: toCents(meta.totalAmount) } : {}),
          ...(meta.purchaseDate ? { purchaseDate: LocalDate.fromInstant(meta.purchaseDate, timeZone) } : {}),
        }
      : undefined;

  return {
    externalId: t.id,
    accountExternalId: account.id,
    occurredOn: LocalDate.fromInstant(t.date, timeZone),
    amount,
    description,
    paymentMethod,
    status: t.status === 'PENDING' ? 'pending' : 'posted',
    ...(counterparty ? { counterparty } : {}),
    ...(installment ? { installment } : {}),
    ...(t.categoryId ? { providerCategoryId: t.categoryId } : {}),
    raw: t,
  };
}

const BILL = /\bfatura\b|pagamento recebido|pagto\.? antecipado/i;

function cardPaymentMethod(t: PluggyTransaction, amount: Money, description: string): PaymentMethod {
  switch (t.operationType) {
    case 'PAGAMENTO_FATURA':
      return 'bill_payment';
    case 'TARIFA':
      return 'fee';
    case 'ESTORNO':
      return 'refund';
    case 'CASHBACK':
      return 'cashback';
    case 'OPERACOES_CREDITO_CONTRATADAS_CARTAO':
      return 'interest';
  }
  if (!amount.isPositive()) return 'card_purchase';
  // Crédito no cartão que não veio rotulado: pagamento da fatura ou estorno.
  return BILL.test(description) || t.categoryId === '05100000' ? 'bill_payment' : 'refund';
}

function bankPaymentMethod(t: PluggyTransaction, description: string): PaymentMethod {
  const op = t.operationType ?? '';
  if (op === 'PIX') return 'pix';
  if (op === 'TED' || op === 'DOC' || op === 'TRANSFERENCIA_MESMA_INSTITUICAO') return 'ted_doc';
  // Débito automático da fatura ("GASTOS CARTAO DE CREDITO") é pagamento de fatura; outros serviços de cartão são tarifa.
  if (op === 'CARTAO') return /gastos?\s+cart/i.test(description) ? 'bill_payment' : 'fee';
  if (BILL.test(description) && t.amount < 0) return 'bill_payment';
  if (op === 'BOLETO') return 'boleto';
  if (op === 'RENDIMENTO_APLIC_FINANCEIRA') return 'yield';
  // Alguns bancos rotulam o rendimento diário como "resgate"; a categoria desempata.
  if (op === 'RESGATE_APLIC_FINANCEIRA') return t.categoryId?.startsWith('0306') ? 'yield' : 'other';
  if (op.startsWith('ENCARGOS') || op === 'OPERACAO_CREDITO') return 'interest';
  if (op.includes('TARIFA')) return 'fee';
  if (t.categoryId === '08090000' || /\b(recompensas?|cashback)\b/i.test(description)) return 'cashback';
  return 'other';
}

function toCounterparty(participant: PluggyParticipant | null | undefined): ProviderTransaction['counterparty'] {
  if (!participant) return undefined;
  const name = participant.name?.trim();
  const document = participant.documentNumber?.value?.trim();
  if (!name && !document) return undefined;
  return { ...(name ? { name } : {}), ...(document ? { document } : {}) };
}
