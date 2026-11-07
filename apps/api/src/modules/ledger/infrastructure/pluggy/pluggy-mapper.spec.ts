import { describe, expect, it } from 'vitest';
import { SYNTHETIC_CNPJ_DIGITS, SYNTHETIC_CPF_DIGITS } from '../../../../../test/fixtures/synthetic-documents.js';
import { holderDocumentOf, institutionNameOf, mapAccount, mapTransaction } from './pluggy-mapper.js';
import type { PluggyAccount, PluggyTransaction } from './pluggy-types.js';

const bank: PluggyAccount = {
  id: 'acc-bank',
  itemId: 'item',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  name: 'BANCO EXEMPLO S.A.',
  balance: 1234.56,
  taxNumber: '123.456.789-09',
};
const card: PluggyAccount = {
  ...bank,
  id: 'acc-card',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  name: 'PLATINUM',
  balance: 812.3,
  taxNumber: null,
  creditData: { creditLimit: 3000 },
};

const tx = (over: Partial<PluggyTransaction>): PluggyTransaction => ({
  id: 't',
  accountId: 'acc-bank',
  date: '2026-03-10T14:00:00.000Z',
  description: 'Descrição',
  amount: -10,
  type: 'DEBIT',
  status: 'POSTED',
  ...over,
});
const mapBank = (over: Partial<PluggyTransaction>) => mapTransaction(tx(over), bank, 'America/Sao_Paulo');
const mapCard = (over: Partial<PluggyTransaction>) =>
  mapTransaction(tx({ accountId: 'acc-card', ...over }), card, 'America/Sao_Paulo');

describe('accounts', () => {
  it('uses the bank account name as the institution (all Meu Pluggy items share one connector)', () => {
    expect(institutionNameOf([card, bank])).toBe('Banco Exemplo S.A.');
  });

  it('credit cards inherit the holder document from the bank account of the same item', () => {
    expect(holderDocumentOf(card, [card, bank])).toBe('123.456.789-09');
  });

  it('maps kinds, and card balance (used limit) as a debt', () => {
    const mapped = mapAccount(card, [card, bank]);
    expect(mapped.kind).toBe('credit_card');
    expect(mapped.balance.cents).toBe(-81230);
    expect(mapped.creditLimit?.cents).toBe(300000);
    expect(mapAccount({ ...bank, subtype: 'SAVINGS_ACCOUNT' }, [bank]).kind).toBe('savings');
    expect(mapAccount(bank, [bank]).balance.cents).toBe(123456);
  });
});

describe('transactions', () => {
  it('converts the instant to the local calendar date', () => {
    expect(mapBank({ date: '2026-03-10T01:30:00.000Z' }).occurredOn.toString()).toBe('2026-03-09');
  });

  it('keeps bank signs and inverts card signs (negative = money leaving the user)', () => {
    expect(mapBank({ amount: -45.9 }).amount.cents).toBe(-4590);
    expect(mapCard({ amount: 75, type: 'DEBIT', operationType: 'PAGAMENTO' }).amount.cents).toBe(-7500);
    expect(mapCard({ amount: -150, type: 'CREDIT', operationType: 'PAGAMENTO_FATURA' }).amount.cents).toBe(15000);
  });

  it('maps bank operation types to payment methods', () => {
    expect(mapBank({ operationType: 'PIX' }).paymentMethod).toBe('pix');
    expect(mapBank({ operationType: 'TED' }).paymentMethod).toBe('ted_doc');
    expect(mapBank({ operationType: 'TRANSFERENCIA_MESMA_INSTITUICAO' }).paymentMethod).toBe('ted_doc');
    expect(mapBank({ operationType: 'BOLETO', description: 'Pagamento de conta' }).paymentMethod).toBe('boleto');
    expect(mapBank({ operationType: 'RENDIMENTO_APLIC_FINANCEIRA', amount: 0.12 }).paymentMethod).toBe('yield');
    expect(mapBank({ operationType: 'ENCARGOS_JUROS_CHEQUE_ESPECIAL' }).paymentMethod).toBe('interest');
    expect(mapBank({ operationType: 'PACOTE_TARIFA_SERVICOS' }).paymentMethod).toBe('fee');
    expect(mapBank({ operationType: 'OUTROS', description: 'Corridas' }).paymentMethod).toBe('other');
  });

  it('recognizes the three shapes of credit card bill payments seen in real data', () => {
    expect(
      mapBank({ operationType: 'BOLETO', description: 'Pagamento efetuado - Pagamento Fatura' }).paymentMethod,
    ).toBe('bill_payment');
    expect(mapBank({ operationType: 'CARTAO', description: 'GASTOS CARTAO DE CREDITO - DOCTO: 1' }).paymentMethod).toBe(
      'bill_payment',
    );
    expect(
      mapBank({ operationType: 'OUTROS', description: 'Pagamento total/parcial fatura em atraso' }).paymentMethod,
    ).toBe('bill_payment');
    expect(mapCard({ amount: -80, type: 'CREDIT', operationType: 'PAGAMENTO_FATURA' }).paymentMethod).toBe(
      'bill_payment',
    );
    expect(
      mapCard({ amount: -80, type: 'CREDIT', operationType: 'PAGAMENTO', description: 'Pagamento recebido' })
        .paymentMethod,
    ).toBe('bill_payment');
  });

  it('an unlabeled card credit mentioning a payment is the bill payment, not a refund', () => {
    expect(mapCard({ amount: -150, type: 'CREDIT', description: 'PAGAMENTO EFETUADO OBRIGADO' }).paymentMethod).toBe(
      'bill_payment',
    );
    expect(mapCard({ amount: -150, type: 'CREDIT', description: 'PGTO DEB AUTOMATICO' }).paymentMethod).toBe(
      'bill_payment',
    );
    expect(mapCard({ amount: -20, type: 'CREDIT', description: 'LOJA X CANCELAMENTO' }).paymentMethod).toBe('refund');
  });

  it('a card-related bank fee is a fee, not a bill payment', () => {
    expect(mapBank({ operationType: 'CARTAO', description: 'SERVICO CARTAO PROTEGIDO' }).paymentMethod).toBe('fee');
  });

  it('a yield labeled as an investment redemption is yield, an actual redemption is not', () => {
    expect(
      mapBank({ operationType: 'RESGATE_APLIC_FINANCEIRA', amount: 0.3, categoryId: '03060000' }).paymentMethod,
    ).toBe('yield');
    expect(
      mapBank({ operationType: 'RESGATE_APLIC_FINANCEIRA', amount: 500, categoryId: '03020000' }).paymentMethod,
    ).toBe('other');
  });

  it('recognizes cashback and card refunds, charges and fees', () => {
    expect(
      mapBank({ operationType: 'OUTROS', amount: 3, description: 'Recompensas', categoryId: '08090000' }).paymentMethod,
    ).toBe('cashback');
    expect(
      mapCard({ amount: -20, type: 'CREDIT', operationType: 'ESTORNO', description: 'LOJA X' }).paymentMethod,
    ).toBe('refund');
    expect(mapCard({ amount: 2.5, operationType: 'TARIFA', description: 'IOF INTERNACIONAL' }).paymentMethod).toBe(
      'fee',
    );
    expect(mapCard({ amount: 30, operationType: 'PAGAMENTO' }).paymentMethod).toBe('card_purchase');
  });

  it('takes the counterparty from the receiver on outflows and from the payer on inflows', () => {
    const paymentData = {
      payer: { name: 'Pagador', documentNumber: { type: 'CNPJ', value: SYNTHETIC_CNPJ_DIGITS } },
      receiver: { name: 'Recebedor', documentNumber: { type: 'CPF', value: SYNTHETIC_CPF_DIGITS } },
    };
    expect(mapBank({ amount: -10, paymentData }).counterparty).toEqual({
      name: 'Recebedor',
      document: SYNTHETIC_CPF_DIGITS,
    });
    expect(mapBank({ amount: 10, type: 'CREDIT', paymentData }).counterparty).toEqual({
      name: 'Pagador',
      document: SYNTHETIC_CNPJ_DIGITS,
    });
  });

  it('maps card installments (total amount may be absent) and the purchase date', () => {
    const mapped = mapCard({
      amount: 33.34,
      operationType: 'PAGAMENTO',
      creditCardMetadata: { installmentNumber: 1, totalInstallments: 3, purchaseDate: '2026-03-08T12:00:00.000Z' },
    });
    expect(mapped.installment).toEqual({ number: 1, total: 3, purchaseDate: expect.anything() });
    expect(mapped.installment?.purchaseDate?.toString()).toBe('2026-03-08');
    expect(
      mapCard({ amount: 10, creditCardMetadata: { installmentNumber: 1, totalInstallments: 1 } }).installment,
    ).toBeUndefined();
  });

  it('maps status, category, description and keeps the raw payload', () => {
    const raw = tx({ status: 'PENDING', categoryId: '10000000', description: null, descriptionRaw: 'RAW DESC' });
    const mapped = mapTransaction(raw, bank, 'America/Sao_Paulo');
    expect(mapped.status).toBe('pending');
    expect(mapped.providerCategoryId).toBe('10000000');
    expect(mapped.description).toBe('RAW DESC');
    expect(mapped.raw).toBe(raw);
  });

  it('rounds amounts to cents (international amounts may carry more decimals)', () => {
    expect(mapBank({ amount: -10.005 }).amount.cents).toBe(-1001);
  });
});
