import { describe, expect, it } from 'vitest';
import { aTransaction } from '../../../../../test/builders/transaction.builder.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { PaymentMethod, Transaction } from '../transaction.js';
import { RecurringDetector } from './recurring-detector.js';
import { breakdownBy, cashFlow, categoryBreakdown, incomeSources, outliers, topExpenses } from './spending-reports.js';

let seq = 0;
const tx = (
  day: string,
  cents: number,
  opts: { category?: string; method?: PaymentMethod; account?: string; description?: string } = {},
) => {
  const t = aTransaction()
    .withId(`r-${++seq}`)
    .on(day)
    .withAmount(cents)
    .withPaymentMethod(opts.method ?? 'card_purchase')
    .withAccount(opts.account ?? 'acc')
    .withDescription(opts.description ?? 'COMPRA')
    .build();
  if (opts.category) t.categorize(opts.category, 'provider');
  return t;
};
const transfer = (day: string, cents: number) => {
  const t = tx(day, cents, { method: 'pix' });
  t.markAsInternalTransfer();
  return t;
};

describe('cashFlow', () => {
  it('sums real income and real spending per month, ignoring transfers between own accounts', () => {
    const txs = [
      tx('2026-09-05', 120000, { method: 'other' }), // renda
      tx('2026-09-10', -30000),
      tx('2026-09-12', 5000, { method: 'refund' }), // estorno abate gasto
      transfer('2026-09-15', -80000),
      transfer('2026-09-15', 80000),
      tx('2026-10-05', 120000, { method: 'other' }),
      tx('2026-10-20', -150000),
    ];

    expect(
      cashFlow(txs, ['2026-09', '2026-10']).map((m) => [m.month, m.income.cents, m.spending.cents, m.net.cents]),
    ).toEqual([
      ['2026-09', 120000, 25000, 95000],
      ['2026-10', 120000, 150000, -30000],
    ]);
  });

  it('includes months without movement as zero', () => {
    expect(cashFlow([], ['2026-01'])[0]?.spending.isZero()).toBe(true);
  });
});

describe('categoryBreakdown', () => {
  const txs = [
    // três meses anteriores: delivery 100 por mês
    ...['2026-07-10', '2026-08-10', '2026-09-10'].map((d) => tx(d, -10000, { category: 'alimentacao.delivery' })),
    tx('2026-10-03', -9000, { category: 'alimentacao.delivery' }),
    tx('2026-10-20', -5000, { category: 'alimentacao.delivery' }),
    tx('2026-10-07', -20000, { category: 'alimentacao.mercado' }),
    tx('2026-10-08', -4000), // sem categoria
    tx('2026-10-09', 2000, { category: 'alimentacao.mercado', method: 'refund' }),
  ];

  it('totals spending per category in the month, with the change against the previous 3-month average', () => {
    const delivery = categoryBreakdown(txs, '2026-10').find((c) => c.categoryId === 'alimentacao.delivery');
    expect(delivery).toMatchObject({ groupId: 'alimentacao', count: 2 });
    expect(delivery?.spent.cents).toBe(14000);
    expect(delivery?.previousAverage.cents).toBe(10000);
    expect(delivery?.changePercent).toBe(40);
  });

  it('nets refunds and reports uncategorized spending separately, sorted by amount', () => {
    const rows = categoryBreakdown(txs, '2026-10');
    expect(rows.map((r) => [r.categoryId, r.spent.cents])).toEqual([
      ['alimentacao.mercado', 18000],
      ['alimentacao.delivery', 14000],
      [null, 4000],
    ]);
  });
});

describe('breakdownBy', () => {
  it('groups spending by any key (account, payment method)', () => {
    const txs = [
      tx('2026-10-01', -1000, { method: 'pix', account: 'a' }),
      tx('2026-10-02', -3000, { method: 'card_purchase', account: 'b' }),
      tx('2026-10-03', -2000, { method: 'pix', account: 'b' }),
    ];
    expect(breakdownBy(txs, '2026-10', (t) => t.paymentMethod).map((r) => [r.key, r.spent.cents])).toEqual([
      ['card_purchase', 3000],
      ['pix', 3000],
    ]);
    expect(breakdownBy(txs, '2026-10', (t) => t.accountId).map((r) => [r.key, r.spent.cents])).toEqual([
      ['b', 5000],
      ['a', 1000],
    ]);
  });
});

describe('topExpenses and outliers', () => {
  const txs = [
    ...Array.from({ length: 6 }, (_, i) =>
      tx(`2026-0${4 + (i % 5)}-10`, -3000 - i * 100, { category: 'alimentacao.restaurantes' }),
    ),
    tx('2026-10-15', -18000, { category: 'alimentacao.restaurantes', description: 'RESTAURANTE CARO' }),
    tx('2026-10-16', -50000, { category: 'moradia.aluguel' }),
  ];

  it('lists the biggest expenses of the month', () => {
    expect(topExpenses(txs, '2026-10', 2).map((t) => t.amount.cents)).toEqual([-50000, -18000]);
  });

  it('flags expenses far above what is usual for their category (needs history)', () => {
    const flagged = outliers(txs, '2026-10');
    expect(flagged.map((o) => o.transaction.description)).toEqual(['RESTAURANTE CARO']);
    expect(flagged[0]?.timesTheMedian).toBeGreaterThan(5);
  });
});

describe('incomeSources', () => {
  const received = (
    day: string,
    cents: number,
    opts: { name?: string; account?: string; method?: PaymentMethod } = {},
  ) => {
    const t = aTransaction()
      .withId(`in-${++seq}`)
      .on(day)
      .withAmount(cents)
      .withPaymentMethod(opts.method ?? 'pix')
      .withAccount(opts.account ?? 'wallet')
      .withDescription(opts.method === 'yield' ? 'Rendimento' : 'Pix recebido')
      .withCounterparty(opts.name)
      .build();
    if (opts.method === 'yield') t.categorize('renda.rendimentos', 'rule');
    return t;
  };

  it('adds up what came from each source in the month, biggest first', () => {
    const txs = [
      received('2026-10-02', 50000, { name: 'Fulano de Tal' }),
      received('2026-10-12', 60000, { name: 'FULANO DE TAL' }),
      received('2026-10-20', 40000, { name: 'Fulano de Tal' }),
      received('2026-10-05', 90000, { name: 'Fundação Exemplo' }),
      received('2026-10-31', 5000, { account: 'wallet', method: 'yield' }),
      received('2026-10-31', 100, { account: 'other-wallet', method: 'yield' }),
      // Rendimento que o banco manda com a própria empresa como contraparte: continua "rendimentos da conta".
      received('2026-10-15', 2000, { account: 'wallet', method: 'yield', name: 'Instituição Exemplo' }),
      received('2026-09-30', 99999, { name: 'Fulano de Tal' }),
    ];

    const sources = incomeSources(txs, '2026-10');

    expect(sources.map((s) => [s.label ?? `${s.categoryId}@${s.accountId}`, s.total.cents, s.count])).toEqual([
      ['Fulano de Tal', 150000, 3],
      ['Fundação Exemplo', 90000, 1],
      ['renda.rendimentos@wallet', 7000, 2],
      ['renda.rendimentos@other-wallet', 100, 1],
    ]);
  });

  it('never counts transfers between own accounts or refunds as income', () => {
    const own = received('2026-10-02', 50000, { name: 'Eu Mesmo' });
    own.markAsInternalTransfer();
    const refund = received('2026-10-03', 1800, { name: 'Empresa X' });
    refund.markAsRefund();

    expect(incomeSources([own, refund], '2026-10')).toEqual([]);
  });
});

describe('RecurringDetector', () => {
  const monthly = (description: string, cents: number, days: string[], method: PaymentMethod = 'card_purchase') =>
    days.map((d) => tx(d, cents, { description, method, category: 'assinaturas.streaming' }));

  it('finds monthly charges with a stable amount and projects the next one and the annual cost', () => {
    const txs = monthly('STREAMING EXEMPLO*123', -3990, ['2026-07-12', '2026-08-12', '2026-09-12', '2026-10-12']);
    const [streaming] = new RecurringDetector().detect(txs, LocalDate.parse('2026-11-07'));
    expect(streaming).toMatchObject({
      label: 'streaming exemplo',
      occurrences: 4,
      categoryId: 'assinaturas.streaming',
    });
    expect(streaming?.typicalAmount.cents).toBe(3990);
    expect(streaming?.nextExpectedOn.toString()).toBe('2026-11-12');
    expect(streaming?.annualCost.cents).toBe(47880);
  });

  it('recognizes a subscription whose card descriptor changes every month (payment gateway prefixes)', () => {
    const subscription = (day: string, description: string) =>
      tx(day, -2990, { description, category: 'assinaturas.streaming' });
    const txs = [
      subscription('2026-08-08', 'PAYPAL STRM STREAMFL.IXPLUS SAO PAULO BRA'),
      subscription('2026-09-10', 'EC STREAMFLIXPLUS SAO PAULO BRA'),
      subscription('2026-10-07', 'DL STREAMFLIXPLUS SAO PAULO BRA'),
      // Outra loja da mesma cidade e categoria: não pode ser misturada.
      tx('2026-09-20', -2990, { description: 'EC OUTRAMARCA SAO PAULO BRA', category: 'assinaturas.streaming' }),
    ];

    const found = new RecurringDetector().detect(txs, LocalDate.parse('2026-11-08'));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ label: 'streamflixplus sao paulo bra', occurrences: 3 });
    expect(found[0]?.nextExpectedOn.toString()).toBe('2026-11-07');
  });

  it('tolerates small amount variations (±10%) and a few days of drift', () => {
    const txs = [
      tx('2026-07-05', -10000, { description: 'OPERADORA' }),
      tx('2026-08-07', -10500, { description: 'OPERADORA' }),
      tx('2026-09-04', -9800, { description: 'OPERADORA' }),
    ];
    expect(new RecurringDetector().detect(txs, LocalDate.parse('2026-09-30'))).toHaveLength(1);
  });

  it('uses only the latest consistent run when the rhythm changed (seen in real data: every ~52 days, then monthly)', () => {
    const days = [
      '2026-02-01',
      '2026-03-26',
      '2026-05-16',
      '2026-07-07',
      '2026-08-01',
      '2026-08-26',
      '2026-09-16',
      '2026-10-12',
    ];
    const txs = days.map((d) => tx(d, -2000, { description: 'OPERADORA PRE-PAGO' }));
    const [found] = new RecurringDetector().detect(txs, LocalDate.parse('2026-10-31'));
    expect(found?.occurrences).toBe(5);
    expect(found?.intervalDays).toBeLessThanOrEqual(26);
    expect(found?.annualCost.cents).toBe(24000);
  });

  it('detects non-monthly rhythms (every ~50 days) with a proportional annual cost', () => {
    const txs = ['2026-03-01', '2026-04-21', '2026-06-11', '2026-08-01'].map((d) =>
      tx(d, -3000, { description: 'RECARGA' }),
    );
    const [found] = new RecurringDetector().detect(txs, LocalDate.parse('2026-08-20'));
    expect(found?.intervalDays).toBe(51);
    expect(found?.annualCost.cents).toBe(Math.round((3000 * 365) / 51));
    expect(found?.nextExpectedOn.toString()).toBe('2026-09-21');
  });

  it('ignores irregular spending at the same merchant, and stopped subscriptions', () => {
    const irregular = ['2026-07-01', '2026-07-03', '2026-08-20', '2026-10-02'].map((d, i) =>
      tx(d, -(2000 + i * 900), { description: 'PADARIA' }),
    );
    const stopped = monthly('ASSINATURA ANTIGA', -2990, ['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(new RecurringDetector().detect([...irregular, ...stopped], LocalDate.parse('2026-11-07'))).toHaveLength(0);
  });

  it('never treats transfers between own accounts or income as subscriptions, and honors dismissals', () => {
    const transfers = ['2026-07-10', '2026-08-10', '2026-09-10'].map((d) => transfer(d, -50000));
    const salary = ['2026-07-05', '2026-08-05', '2026-09-05'].map((d) =>
      tx(d, 120000, { description: 'SALARIO', method: 'other' }),
    );
    const sub = monthly('APP EXEMPLO', -1990, ['2026-07-20', '2026-08-20', '2026-09-20']);
    const detector = new RecurringDetector();
    const [found] = detector.detect([...transfers, ...salary, ...sub], LocalDate.parse('2026-10-01'));
    expect(found?.label).toBe('app exemplo');
    expect(detector.detect(sub, LocalDate.parse('2026-10-01'), new Set([found?.key ?? '']))).toHaveLength(0);
  });

  it('can recognize recurring Pix to the same person by counterparty (e.g. rent)', () => {
    const rent = ['2026-07-10', '2026-08-10', '2026-09-10'].map((d) => {
      const t = aTransaction()
        .on(d)
        .withAmount(-65000)
        .withPaymentMethod('pix')
        .withDescription('Pix enviado')
        .withCounterparty('Locador Exemplo')
        .build();
      return t;
    });
    const [found] = new RecurringDetector().detect(rent as Transaction[], LocalDate.parse('2026-10-01'));
    expect(found?.label).toBe('locador exemplo');
  });

  it('identifies a recurring Pix known only by document without exposing the document in the key', async () => {
    const { SYNTHETIC_CPF_DIGITS } = await import('../../../../../test/fixtures/synthetic-documents.js');
    const rent = ['2026-07-10', '2026-08-10', '2026-09-10'].map((d) =>
      aTransaction()
        .on(d)
        .withAmount(-65000)
        .withPaymentMethod('pix')
        .withDescription('Pix enviado')
        .withCounterparty(undefined, SYNTHETIC_CPF_DIGITS)
        .build(),
    );
    const [found] = new RecurringDetector().detect(rent, LocalDate.parse('2026-10-01'));
    expect(found?.label).toBe('pix recorrente');
    expect(found?.key).toMatch(/^doc:[0-9a-f]{8}$/);
    expect(JSON.stringify(found)).not.toContain(SYNTHETIC_CPF_DIGITS);
  });
});
