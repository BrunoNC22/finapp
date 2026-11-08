import { describe, expect, it } from 'vitest';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import {
  OTHER_SYNTHETIC_CNPJ,
  SYNTHETIC_CPF,
  SYNTHETIC_CPF_WRONG_CHECK_DIGITS,
} from '../../../../../test/fixtures/synthetic-documents.js';
import type { PaymentMethod } from '../transaction.js';
import { counterpartyIdentity, LearnedCategories } from './learned-categories.js';

let seq = 0;
const pix = (cents: number, name?: string, document?: string, method: PaymentMethod = 'pix') =>
  aTransaction()
    .withId(`l-${++seq}`)
    .withAmount(cents)
    .withPaymentMethod(method)
    .withDescription('Pix enviado')
    .withCounterparty(name, document)
    .build();
const corrected = (categoryId: string, ...args: Parameters<typeof pix>) => {
  const t = pix(...args);
  t.categorize(categoryId, 'manual');
  return t;
};
const card = (description: string) =>
  aTransaction()
    .withId(`c-${++seq}`)
    .withAmount(-2500)
    .withPaymentMethod('card_purchase')
    .withDescription(description)
    .build();

describe('counterpartyIdentity', () => {
  it('prefers the full document, then the name; CPF by its base digits', () => {
    expect(counterpartyIdentity(pix(-100, 'Empresa X', OTHER_SYNTHETIC_CNPJ))).toBe(
      counterpartyIdentity(pix(-900, 'EMPRESA X LTDA', OTHER_SYNTHETIC_CNPJ)),
    );
    expect(counterpartyIdentity(pix(-100, undefined, SYNTHETIC_CPF))).toBe(
      counterpartyIdentity(pix(-100, undefined, SYNTHETIC_CPF_WRONG_CHECK_DIGITS)),
    );
    expect(counterpartyIdentity(pix(-100, 'Fulano de Tal'))).toBe(counterpartyIdentity(pix(-5, 'fulano  de tal')));
  });

  it('keeps expenses and income apart, and never learns from a generic pix with no counterparty', () => {
    expect(counterpartyIdentity(pix(-100, 'Empresa X'))).not.toBe(counterpartyIdentity(pix(100, 'Empresa X')));
    expect(counterpartyIdentity(pix(-100))).toBeUndefined();
  });

  it('uses the merchant for card purchases, ignoring gateway prefixes', () => {
    expect(counterpartyIdentity(card('EC LOJA EXEMPLO SAO PAULO'))).toBe(
      counterpartyIdentity(card('DL LOJA EXEMPLO SAO PAULO')),
    );
  });
});

describe('LearnedCategories', () => {
  it('learns the category the user chose for a counterparty and applies it to the others', () => {
    const learned = LearnedCategories.from([corrected('transporte.app', -1800, 'Empresa X', OTHER_SYNTHETIC_CNPJ)]);
    expect(learned.categoryFor(pix(-2300, 'Empresa X', OTHER_SYNTHETIC_CNPJ))).toBe('transporte.app');
    expect(learned.categoryFor(pix(2300, 'Empresa X', OTHER_SYNTHETIC_CNPJ))).toBeUndefined();
    expect(learned.categoryFor(pix(-2300, 'Outra Empresa'))).toBeUndefined();
  });

  it('follows the majority of the corrections and learns nothing on a tie', () => {
    const majority = LearnedCategories.from([
      corrected('alimentacao.delivery', -100, 'Fulano'),
      corrected('alimentacao.delivery', -100, 'Fulano'),
      corrected('moradia.aluguel', -100, 'Fulano'),
    ]);
    expect(majority.categoryFor(pix(-100, 'Fulano'))).toBe('alimentacao.delivery');
    const tie = LearnedCategories.from([
      corrected('alimentacao.delivery', -100, 'Fulano'),
      corrected('moradia.aluguel', -100, 'Fulano'),
    ]);
    expect(tie.categoryFor(pix(-100, 'Fulano'))).toBeUndefined();
  });

  it('only learns from manual choices', () => {
    const automatic = pix(-100, 'Fulano');
    automatic.categorize('outros', 'provider');
    expect(LearnedCategories.from([automatic]).categoryFor(pix(-100, 'Fulano'))).toBeUndefined();
  });
});
