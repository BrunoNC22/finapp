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

  it('one counterparty, different purposes: follows the correction with the closest amount', () => {
    // Pix para a mesma pessoa: 350 é aluguel, 120 é conta de luz
    const learned = LearnedCategories.from([
      corrected('moradia.aluguel', -35000, 'Fulana'),
      corrected('moradia.contas', -12000, 'Fulana'),
    ]);
    expect(learned.categoryFor(pix(-35000, 'Fulana'))).toBe('moradia.aluguel');
    expect(learned.categoryFor(pix(-33500, 'Fulana'))).toBe('moradia.aluguel'); // dentro de ±10%
    expect(learned.categoryFor(pix(-12500, 'Fulana'))).toBe('moradia.contas');
    expect(learned.categoryFor(pix(-80000, 'Fulana'))).toBeUndefined(); // longe de tudo e sem maioria
  });

  it('far from every example, the majority still decides', () => {
    const learned = LearnedCategories.from([
      corrected('transporte.app', -1500, 'Empresa X'),
      corrected('transporte.app', -2200, 'Empresa X'),
      corrected('lazer.outros', -9000, 'Empresa X'),
    ]);
    expect(learned.categoryFor(pix(-4500, 'Empresa X'))).toBe('transporte.app');
  });

  it('only learns from manual choices', () => {
    const automatic = pix(-100, 'Fulano');
    automatic.categorize('outros', 'provider');
    expect(LearnedCategories.from([automatic]).categoryFor(pix(-100, 'Fulano'))).toBeUndefined();
  });
});
