import { describe, expect, it } from 'vitest';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import { SYNTHETIC_CPF, SYNTHETIC_CPF_DIGITS } from '../../../../../test/fixtures/synthetic-documents.js';
import { Money } from '../../../../shared/kernel/money.js';
import { CategorizationRule, InvalidRuleError } from './categorization-rule.js';
import { Categorizer, type ProviderCategoryMap } from './categorizer.js';
import { LearnedCategories } from './learned-categories.js';

class StubProviderMap implements ProviderCategoryMap {
  constructor(private readonly map: Record<string, string>) {}
  resolve(providerCategoryId: string): string | undefined {
    return this.map[providerCategoryId];
  }
}

const providerMap = new StubProviderMap({ 'prov-groceries': 'alimentacao.mercado', 'prov-gym': 'lazer.esportes' });
const rule = (props: Partial<Parameters<typeof CategorizationRule.create>[0]> & { categoryId: string }) =>
  CategorizationRule.create({ id: `rule-${Math.random()}`, name: 'Regra', priority: 100, enabled: true, ...props });

describe('CategorizationRule', () => {
  it('matches by description (case and accent insensitive)', () => {
    const r = rule({ categoryId: 'transporte.app', descriptionContains: 'corrida' });
    expect(r.matches(aTransaction().withDescription('Corridas 99').build())).toBe(true);
    expect(r.matches(aTransaction().withDescription('CORRÍDA cancelada').build())).toBe(true);
    expect(r.matches(aTransaction().withDescription('Mercado').build())).toBe(false);
  });

  it('matches by regular expression', () => {
    const r = rule({ categoryId: 'transporte.app', descriptionPattern: '^corridas?\\b' });
    expect(r.matches(aTransaction().withDescription('Corridas').build())).toBe(true);
    expect(r.matches(aTransaction().withDescription('Pagamento corridas').build())).toBe(false);
  });

  it('rejects an invalid regular expression when created', () => {
    expect(() => rule({ categoryId: 'x', descriptionPattern: '([' })).toThrow(InvalidRuleError);
  });

  it('refuses patterns that could freeze the sync (catastrophic backtracking) and very long ones', () => {
    for (const pattern of ['(a+)+$', '(x*)*', '(\\w+\\s?)*$', '(ab{1,})+', 'a'.repeat(121)]) {
      expect(() => rule({ categoryId: 'x', descriptionPattern: pattern }), pattern).toThrow(InvalidRuleError);
    }
    for (const pattern of ['^corridas?\\b', '(uber|99) ?pop', 'mercado|padaria', '^pix (enviado|recebido)']) {
      expect(() => rule({ categoryId: 'x', descriptionPattern: pattern }), pattern).not.toThrow();
    }
  });

  it('requires at least one condition', () => {
    expect(() => rule({ categoryId: 'x' })).toThrow(InvalidRuleError);
  });

  it('combines conditions with AND: counterparty document, account, payment method, direction and amount range', () => {
    const rent = rule({
      categoryId: 'moradia.aluguel',
      counterpartyDocument: SYNTHETIC_CPF,
      paymentMethod: 'pix',
      direction: 'outflow',
      accountId: 'wallet',
      minAmount: Money.fromCents(50000),
      maxAmount: Money.fromCents(150000),
    });
    const base = () =>
      aTransaction()
        .withAccount('wallet')
        .withPaymentMethod('pix')
        .withAmount(-90000)
        .withCounterparty(undefined, SYNTHETIC_CPF_DIGITS);

    expect(rent.matches(base().build())).toBe(true);
    expect(rent.matches(base().withAmount(-1000).build())).toBe(false);
    expect(rent.matches(base().withAccount('bank').build())).toBe(false);
    expect(rent.matches(base().withAmount(90000).build())).toBe(false);
    expect(rent.matches(base().withPaymentMethod('ted_doc').build())).toBe(false);
  });

  it('a disabled rule never matches', () => {
    const r = rule({ categoryId: 'x', descriptionContains: 'mercado', enabled: false });
    expect(r.matches(aTransaction().withDescription('mercado').build())).toBe(false);
  });
});

describe('Categorizer', () => {
  const categorizer = new Categorizer(providerMap);

  it('uses the provider category when nothing else applies', () => {
    const tx = aTransaction().withProviderCategory('prov-groceries').build();
    categorizer.categorize([tx], []);
    expect(tx.category).toEqual({ categoryId: 'alimentacao.mercado', source: 'provider' });
  });

  it('a user rule wins over the provider (fixes provider mistakes)', () => {
    const ride = aTransaction()
      .withDescription('Corridas')
      .withPaymentMethod('other')
      .withProviderCategory('prov-gym')
      .build();
    categorizer.categorize([ride], [rule({ categoryId: 'transporte.app', descriptionPattern: '^corridas?\\b' })]);
    expect(ride.category).toEqual({ categoryId: 'transporte.app', source: 'rule' });
  });

  it('the highest priority (lowest number) rule wins', () => {
    const tx = aTransaction().withDescription('mercado do bairro').build();
    categorizer.categorize(
      [tx],
      [
        rule({ categoryId: 'compras.outras', descriptionContains: 'mercado', priority: 50 }),
        rule({ categoryId: 'alimentacao.mercado', descriptionContains: 'mercado', priority: 10 }),
      ],
    );
    expect(tx.category?.categoryId).toBe('alimentacao.mercado');
  });

  it('derives the category from the payment method for yield, cashback, fees and interest', () => {
    const txs = {
      yield: aTransaction().withAmount(12).withPaymentMethod('yield').withProviderCategory('prov-groceries').build(),
      cashback: aTransaction().withAmount(80).withPaymentMethod('cashback').build(),
      fee: aTransaction().withPaymentMethod('fee').build(),
      interest: aTransaction().withPaymentMethod('interest').build(),
    };
    categorizer.categorize(Object.values(txs), []);
    expect(txs.yield.category?.categoryId).toBe('renda.rendimentos');
    expect(txs.cashback.category?.categoryId).toBe('renda.cashback');
    expect(txs.fee.category?.categoryId).toBe('financeiro.tarifas');
    expect(txs.interest.category?.categoryId).toBe('financeiro.juros');
  });

  it('for fees and interest, a more specific provider category wins (e.g. a tax), the payment method is only a fallback', () => {
    const map = new StubProviderMap({ 'prov-tax': 'financeiro.impostos' });
    const fee = aTransaction().withPaymentMethod('fee').withProviderCategory('prov-tax').build();
    new Categorizer(map).categorize([fee], []);
    expect(fee.category).toEqual({ categoryId: 'financeiro.impostos', source: 'provider' });
  });

  it('never touches a manual category', () => {
    const tx = aTransaction().withDescription('Corridas').withProviderCategory('prov-gym').build();
    tx.categorize('lazer.outros', 'manual');
    categorizer.categorize([tx], [rule({ categoryId: 'transporte.app', descriptionContains: 'corridas' })]);
    expect(tx.category).toEqual({ categoryId: 'lazer.outros', source: 'manual' });
  });

  it('does not categorize internal transfers (they are neither income nor expense)', () => {
    const tx = aTransaction().withPaymentMethod('bill_payment').withProviderCategory('prov-groceries').build();
    categorizer.categorize([tx], []);
    expect(tx.category).toBeUndefined();
  });

  it('leaves unknown provider categories uncategorized', () => {
    const tx = aTransaction().withProviderCategory('prov-unknown').build();
    categorizer.categorize([tx], []);
    expect(tx.category).toBeUndefined();
  });

  it('reports how many transactions got a category and from which source', () => {
    const report = categorizer.categorize(
      [
        aTransaction().withProviderCategory('prov-groceries').build(),
        aTransaction().withDescription('Corridas').build(),
        aTransaction().build(),
      ],
      [rule({ categoryId: 'transporte.app', descriptionContains: 'corridas' })],
    );
    expect(report).toEqual({
      learned: 0,
      refund: 0,
      provider: 1,
      rule: 1,
      paymentMethod: 0,
      uncategorized: 1,
      skipped: 0,
    });
  });

  it('a category learned from the user corrections beats rules and the provider, but not a manual choice', () => {
    const example = aTransaction().withAmount(-1500).withPaymentMethod('pix').withCounterparty('Empresa X').build();
    example.categorize('transporte.app', 'manual');
    const learned = LearnedCategories.from([example]);
    const other = aTransaction()
      .withAmount(-2200)
      .withPaymentMethod('pix')
      .withDescription('Corridas')
      .withCounterparty('Empresa X')
      .withProviderCategory('prov-gym')
      .build();
    const manual = aTransaction().withAmount(-900).withPaymentMethod('pix').withCounterparty('Empresa X').build();
    manual.categorize('lazer.outros', 'manual');

    const report = new Categorizer(providerMap).categorize(
      [other, manual],
      [rule({ categoryId: 'alimentacao.mercado', descriptionContains: 'corrida' })],
      learned,
    );

    expect(other.category).toEqual({ categoryId: 'transporte.app', source: 'learned' });
    expect(manual.category).toEqual({ categoryId: 'lazer.outros', source: 'manual' });
    expect(report.learned).toBe(1);
  });

  describe('refunds', () => {
    const ride = (cents: number) =>
      aTransaction()
        .withAmount(cents)
        .withPaymentMethod('pix')
        .withDescription('Corridas')
        .withCounterparty('Empresa X')
        .build();
    const back = (cents: number, name = 'Empresa X') =>
      aTransaction()
        .withAmount(cents)
        .withPaymentMethod('pix')
        .withDescription('Pix recebido')
        .withCounterparty(name)
        .build();
    const rideRule = rule({ categoryId: 'transporte.app', descriptionContains: 'corrida' });

    it('money back from whom the user keeps paying is a refund of that spending, not income', () => {
      const rides = [ride(-1500), ride(-2300), ride(-1800)];
      const refund = back(2300);

      const report = new Categorizer(providerMap).categorize([refund, ...rides], [rideRule]);

      expect(refund.category).toEqual({ categoryId: 'transporte.app-devolucao', source: 'rule' });
      expect(refund.classification).toBe('expense');
      expect(report.refund).toBe(1);
    });

    it('a refund of other spending goes back to the same category', () => {
      const orders = [-3000, -4500, -2800].map((cents) =>
        aTransaction()
          .withAmount(cents)
          .withPaymentMethod('pix')
          .withCounterparty('Loja Y')
          .withProviderCategory('prov-groceries')
          .build(),
      );
      const refund = back(2800, 'Loja Y');

      new Categorizer(providerMap).categorize([...orders, refund], []);

      expect(refund.category?.categoryId).toBe('alimentacao.mercado');
      expect(refund.isRefund).toBe(true);
    });

    it('is not a refund with too little history or when more comes back than was ever paid', () => {
      const tooBig = back(9000);
      const fewPayments = back(1000, 'Empresa Z');
      const payments = [
        ride(-1500),
        ride(-2300),
        ride(-1800),
        aTransaction()
          .withAmount(-1000)
          .withPaymentMethod('pix')
          .withDescription('Corridas')
          .withCounterparty('Empresa Z')
          .build(),
      ];

      new Categorizer(providerMap).categorize([tooBig, fewPayments, ...payments], [rideRule]);

      expect(tooBig.classification).toBe('income');
      expect(fewPayments.classification).toBe('income');
    });

    it('money from a person the user also pays stays income (loan, split bill, family): too ambiguous to guess', () => {
      const toFriend = [-5000, -3000, -4000].map((cents) =>
        aTransaction().withAmount(cents).withPaymentMethod('pix').withCounterparty('Fulano').build(),
      );
      for (const t of toFriend) t.categorize('pessoas.pix', 'manual');
      const fromFriend = back(3000, 'Fulano');

      new Categorizer(providerMap).categorize([...toFriend, fromFriend], []);

      expect(fromFriend.classification).toBe('income');
    });

    it('stops being a refund when the evidence goes away (automatic decisions are recomputed)', () => {
      const rides = [ride(-1500), ride(-2300), ride(-1800)];
      const refund = back(1500);
      const categorizer = new Categorizer(providerMap);
      categorizer.categorize([refund, ...rides], [rideRule]);
      expect(refund.isRefund).toBe(true);

      categorizer.categorize([refund], [rideRule]);

      expect(refund.classification).toBe('income');
      expect(refund.category?.categoryId).not.toBe('transporte.app-devolucao');
    });

    it('learns refunds from a manual correction of an incoming amount', () => {
      const example = back(1200);
      example.categorize('transporte.app-devolucao', 'manual');
      example.classifyManually('expense');
      const another = back(800);

      new Categorizer(providerMap).categorize([another], [], LearnedCategories.from([example]));

      expect(another.category).toEqual({ categoryId: 'transporte.app-devolucao', source: 'learned' });
      expect(another.isRefund).toBe(true);
    });
  });
});
