import { describe, expect, it } from 'vitest';
import { anAccount } from '../../../../../test/builders/account.builder.js';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import {
  OTHER_SYNTHETIC_CNPJ,
  OTHER_SYNTHETIC_CPF,
  SYNTHETIC_CNPJ,
  SYNTHETIC_CPF,
  SYNTHETIC_CPF_WRONG_CHECK_DIGITS,
} from '../../../../../test/fixtures/synthetic-documents.js';
import type { Transaction } from '../transaction.js';
import { InternalTransferMatcher } from './internal-transfer-matcher.js';

// Cenário sintético com a mesma ESTRUTURA do uso real: uma conta PJ, três contas PF e um cartão.
const ME = SYNTHETIC_CPF;
const MY_COMPANY = SYNTHETIC_CNPJ;
const SOMEONE_ELSE = OTHER_SYNTHETIC_CPF;

const business = anAccount().withId('pj').withHolderDocument(MY_COMPANY).build();
const wallet = anAccount().withId('wallet').withHolderDocument(ME).build();
const bank = anAccount().withId('bank').withHolderDocument(ME).build();
const card = anAccount().withId('card').withKind('credit_card').withHolderDocument(ME).build();
const accounts = [business, wallet, bank, card];

const pix = (id: string, account: string, cents: number, day: string, counterpartyDoc?: string) =>
  aTransaction()
    .withId(id)
    .withAccount(account)
    .withAmount(cents)
    .on(day)
    .withPaymentMethod('pix')
    .withCounterparty(undefined, counterpartyDoc)
    .build();

const match = (txs: Transaction[]) => new InternalTransferMatcher().match(txs, accounts);

describe('InternalTransferMatcher', () => {
  it('pairs a transfer between two accounts of the user (PJ → wallet)', () => {
    const out = pix('out', 'pj', -150000, '2026-03-05', ME);
    const into = pix('in', 'wallet', 150000, '2026-03-05', MY_COMPANY);

    const report = match([out, into]);

    expect(report.pairs).toEqual([{ outflowId: 'out', inflowId: 'in', reason: 'transfer' }]);
    expect(out.classification).toBe('internal_transfer');
    expect(into.classification).toBe('internal_transfer');
    expect(out.transferLink).toBe('in');
    expect(into.transferLink).toBe('out');
  });

  it('follows a same-day chain PJ → wallet → bank, using who paid to break the tie', () => {
    const pjOut = pix('pj-out', 'pj', -150000, '2026-03-05', ME);
    const walletIn = pix('wallet-in', 'wallet', 150000, '2026-03-05', MY_COMPANY);
    const walletOut = pix('wallet-out', 'wallet', -150000, '2026-03-05', ME);
    const bankIn = pix('bank-in', 'bank', 150000, '2026-03-05', ME);

    const report = match([bankIn, walletOut, walletIn, pjOut]);

    expect(report.pairs).toEqual(
      expect.arrayContaining([
        { outflowId: 'pj-out', inflowId: 'wallet-in', reason: 'transfer' },
        { outflowId: 'wallet-out', inflowId: 'bank-in', reason: 'transfer' },
      ]),
    );
    expect(report.pairs).toHaveLength(2);
  });

  it('accepts a small delay between the two sides (up to the window)', () => {
    const out = pix('out', 'bank', -20000, '2026-03-05', ME);
    const into = pix('in', 'wallet', 20000, '2026-03-07', ME);
    expect(match([out, into]).pairs).toHaveLength(1);

    const late = pix('late', 'wallet', 20000, '2026-03-12', ME);
    const out2 = pix('out2', 'bank', -20000, '2026-03-05', ME);
    expect(match([out2, late]).pairs).toHaveLength(0);
  });

  it('never pairs with a payment to or from someone else, even with the same amount and date', () => {
    const toFriend = pix('to-friend', 'wallet', -5000, '2026-03-05', SOMEONE_ELSE);
    const fromFriend = pix('from-friend', 'bank', 5000, '2026-03-05', SOMEONE_ELSE);

    const report = match([toFriend, fromFriend]);

    expect(report.pairs).toHaveLength(0);
    expect(toFriend.classification).toBe('expense');
    expect(fromFriend.classification).toBe('income');
  });

  it('marks a transfer to an own document as internal even without the other side (untracked account or older history)', () => {
    const out = pix('out', 'wallet', -30000, '2026-03-05', ME);

    const report = match([out]);

    expect(report.unpaired).toEqual([{ transactionId: 'out', reason: 'own_document' }]);
    expect(out.classification).toBe('internal_transfer');
    expect(out.transferLink).toBeUndefined();
  });

  it('ignores the own document on operations that are not transfers (fees, rides, card bill debit, purchases)', () => {
    const fee = aTransaction()
      .withAccount('bank')
      .withAmount(-890)
      .withPaymentMethod('fee')
      .withCounterparty(undefined, ME)
      .build();
    const ride = aTransaction()
      .withAccount('wallet')
      .withAmount(-2350)
      .withPaymentMethod('other')
      .withCounterparty(undefined, ME)
      .build();

    const report = match([fee, ride]);

    expect(report.unpaired).toHaveLength(0);
    expect(fee.classification).toBe('expense');
    expect(ride.classification).toBe('expense');
  });

  it('links a card bill payment from a bank account to the payment received on the card', () => {
    const fromBank = aTransaction()
      .withId('bill-out')
      .withAccount('bank')
      .withAmount(-80000)
      .on('2026-03-10')
      .withPaymentMethod('bill_payment')
      .build();
    const onCard = aTransaction()
      .withId('bill-in')
      .withAccount('card')
      .withAmount(80000)
      .on('2026-03-11')
      .withPaymentMethod('bill_payment')
      .build();

    const report = match([fromBank, onCard]);

    expect(report.pairs).toEqual([{ outflowId: 'bill-out', inflowId: 'bill-in', reason: 'bill_payment' }]);
    expect(fromBank.transferLink).toBe('bill-in');
  });

  it('treats a pix to the own document that matches a card payment as a bill payment', () => {
    const pixToOwnCard = pix('pix-card', 'bank', -12000, '2026-03-10', ME);
    const onCard = aTransaction()
      .withId('card-in')
      .withAccount('card')
      .withAmount(12000)
      .on('2026-03-10')
      .withPaymentMethod('bill_payment')
      .build();

    expect(match([pixToOwnCard, onCard]).pairs).toEqual([
      { outflowId: 'pix-card', inflowId: 'card-in', reason: 'bill_payment' },
    ]);
  });

  it('links a bill paid by pix to the card issuer (its CNPJ, not the user document) or with no document', () => {
    const cardCredit = (id: string, cents: number, day: string) =>
      aTransaction().withId(id).withAccount('card').withAmount(cents).on(day).withPaymentMethod('bill_payment').build();
    const toIssuer = pix('to-issuer', 'bank', -45000, '2026-04-10', OTHER_SYNTHETIC_CNPJ);
    const noDocument = pix('no-doc', 'wallet', -7000, '2026-04-12');
    const credits = [cardCredit('credit-1', 45000, '2026-04-11'), cardCredit('credit-2', 7000, '2026-04-12')];

    const report = match([toIssuer, noDocument, ...credits]);

    expect(report.pairs).toEqual(
      expect.arrayContaining([
        { outflowId: 'to-issuer', inflowId: 'credit-1', reason: 'bill_payment' },
        { outflowId: 'no-doc', inflowId: 'credit-2', reason: 'bill_payment' },
      ]),
    );
    expect(toIssuer.classification).toBe('internal_transfer');
  });

  it("prefers the bank's own bill payment over a same-amount pix to someone else", () => {
    const toFriend = pix('a-to-friend', 'wallet', -9000, '2026-04-10', OTHER_SYNTHETIC_CPF);
    const billDebit = aTransaction()
      .withId('z-bill')
      .withAccount('bank')
      .withAmount(-9000)
      .on('2026-04-10')
      .withPaymentMethod('bill_payment')
      .build();
    const credit = aTransaction()
      .withId('credit')
      .withAccount('card')
      .withAmount(9000)
      .on('2026-04-10')
      .withPaymentMethod('bill_payment')
      .build();

    const report = match([toFriend, billDebit, credit]);

    expect(report.pairs).toEqual([{ outflowId: 'z-bill', inflowId: 'credit', reason: 'bill_payment' }]);
    expect(toFriend.classification).toBe('expense');
  });

  it('never pairs a pix to someone else with a transfer into another account (only card bills relax the document)', () => {
    const toFriend = pix('to-friend', 'wallet', -5000, '2026-03-05', OTHER_SYNTHETIC_CNPJ);
    const intoBank = pix('into-bank', 'bank', 5000, '2026-03-05');

    expect(match([toFriend, intoBank]).pairs).toHaveLength(0);
  });

  it('recognizes the user CPF even when the bank sends wrong check digits', () => {
    const out = pix('out', 'wallet', -30000, '2026-03-05', SYNTHETIC_CPF_WRONG_CHECK_DIGITS);

    match([out]);

    expect(out.classification).toBe('internal_transfer');
  });

  it('does not link when two candidates are equally good, but still classifies by the own document', () => {
    const out = pix('out', 'bank', -10000, '2026-03-05', ME);
    const a = pix('a', 'wallet', 10000, '2026-03-05', ME);
    const b = pix('b', 'card', 10000, '2026-03-05', ME);

    const report = match([out, a, b]);

    expect(report.pairs).toHaveLength(0);
    expect(report.ambiguous).toEqual([{ transactionId: 'out', candidateIds: ['a', 'b'] }]);
    expect(out.classification).toBe('internal_transfer');
  });

  it('respects manual decisions: a manually classified side is never linked', () => {
    const out = pix('out', 'pj', -150000, '2026-03-05', ME);
    const into = pix('in', 'wallet', 150000, '2026-03-05', MY_COMPANY);
    into.classifyManually('income');

    const report = match([out, into]);

    expect(report.pairs).toHaveLength(0);
    expect(into.classification).toBe('income');
  });

  it('is idempotent: running twice gives the same result and keeps existing links', () => {
    const out = pix('out', 'pj', -150000, '2026-03-05', ME);
    const into = pix('in', 'wallet', 150000, '2026-03-05', MY_COMPANY);
    match([out, into]);

    const second = match([out, into]);

    expect(second.pairs).toHaveLength(0);
    expect(second.alreadyLinked).toBe(2);
    expect(out.transferLink).toBe('in');
  });

  it('never pairs two transactions of the same account', () => {
    const out = pix('out', 'wallet', -5000, '2026-03-05', ME);
    const back = pix('back', 'wallet', 5000, '2026-03-05', ME);
    expect(match([out, back]).pairs).toHaveLength(0);
  });
});
