import type { Clock } from '../../../../shared/application/clock.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import {
  OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnection,
  type ProviderTransaction,
} from '../../application/ports/open-finance-provider.js';
import type { ProviderCategoryMap } from '../../domain/categorization/categorizer.js';
import { DEFAULT_CATEGORIES } from '../../domain/categorization/default-taxonomy.js';

// Pessoa e empresas FICTÍCIAS. Documentos sintéticos, sem relação com pessoas reais.
const PERSON = '12345678909';
const COMPANY = '12345678000195';
const CLIENT = '98765432000110';
const SCHOLARSHIP_PAYER = '11222333000144';
const LANDLORD = '98765432100';
const MERCHANTS = ['45678901000123', '56789012000134', '67890123000145'];

const ACCOUNTS: readonly ProviderAccount[] = [
  account('demo-aurora-pf', 'demo-aurora', 'Banco Aurora', 'Conta Aurora', 'checking', PERSON, 84_532),
  account(
    'demo-aurora-card',
    'demo-aurora',
    'Banco Aurora',
    'Aurora Platinum',
    'credit_card',
    PERSON,
    -61_240,
    300_000,
  ),
  account('demo-agil-pf', 'demo-agil', 'Carteira Ágil', 'Carteira Ágil', 'checking', PERSON, 23_410),
  account('demo-aurora-pj', 'demo-aurora-pj', 'Banco Aurora Empresas', 'Aurora Empresas', 'checking', COMPANY, 1_200),
  account(
    'demo-movimento',
    'demo-movimento',
    'Carteira Movimento',
    'Carteira Movimento',
    'payment_account',
    PERSON,
    41_870,
  ),
];

function account(
  externalId: string,
  connectionId: string,
  institutionName: string,
  name: string,
  kind: ProviderAccount['kind'],
  holderDocument: string,
  balanceCents: number,
  limitCents?: number,
): ProviderAccount {
  return {
    externalId,
    connectionId,
    institutionName,
    name,
    kind,
    holderDocument,
    balance: Money.fromCents(balanceCents),
    ...(limitCents ? { creditLimit: Money.fromCents(limitCents) } : {}),
  };
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** O provedor demo usa diretamente os ids da taxonomia do app como "categoria do provedor". */
class IdentityCategoryMap implements ProviderCategoryMap {
  private readonly known = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  resolve(providerCategoryId: string): string | undefined {
    return this.known.has(providerCategoryId) ? providerCategoryId : undefined;
  }
}

/**
 * Open Finance de mentira: uma pessoa fictícia com 12 meses de movimento, determinístico.
 * A ESTRUTURA espelha um uso real (bolsa, freela recebido em conta PJ e repassado, carteira Pix,
 * carteira de corridas com rendimento, cartão com parcelamentos) e inclui de propósito os casos
 * difíceis: cadeias de transferência, pagamento de fatura, parcelas iniciadas antes do histórico,
 * categoria errada vinda do "provedor" e um empate que o conciliador não deve resolver sozinho.
 */
export class DemoOpenFinanceProvider extends OpenFinanceProvider {
  readonly categoryMap: ProviderCategoryMap = new IdentityCategoryMap();
  private generated: Map<string, ProviderTransaction[]> | undefined;

  constructor(
    private readonly clock: Clock,
    private readonly seed = 2026,
  ) {
    super();
  }

  async listConnections(): Promise<ProviderConnection[]> {
    const now = this.clock.now();
    const consentExpiresAt = new Date(now.getTime() + 300 * 86_400_000);
    return [...new Map(ACCOUNTS.map((a) => [a.connectionId, a.institutionName]))].map(([id, institutionName]) => ({
      id,
      institutionName,
      status: 'active',
      consentExpiresAt,
      lastUpdatedAt: now,
    }));
  }

  async listAccounts(connectionId: string): Promise<ProviderAccount[]> {
    return ACCOUNTS.filter((a) => a.connectionId === connectionId);
  }

  async listTransactions(
    accountExternalId: string,
    range: { readonly from: LocalDate; readonly to: LocalDate },
  ): Promise<ProviderTransaction[]> {
    return (this.all().get(accountExternalId) ?? []).filter(
      (t) => !t.occurredOn.isBefore(range.from) && !t.occurredOn.isAfter(range.to),
    );
  }

  private all(): Map<string, ProviderTransaction[]> {
    this.generated ??= new DemoHistory(LocalDate.fromInstant(this.clock.now(), 'UTC'), random(this.seed)).build();
    return this.generated;
  }
}

/** Monta o histórico fictício mês a mês. */
class DemoHistory {
  private readonly byAccount = new Map<string, ProviderTransaction[]>(ACCOUNTS.map((a) => [a.externalId, []]));
  private counter = 0;

  constructor(
    private readonly today: LocalDate,
    private readonly rnd: () => number,
  ) {}

  build(): Map<string, ProviderTransaction[]> {
    const first = LocalDate.of(this.today.year, this.today.month, 1).addMonths(-12);
    let previousCardSpending = 48_000;
    for (let m = 0; m <= 12; m++) {
      const month = first.addMonths(m);
      const cardSpending = this.month(month, previousCardSpending, m);
      previousCardSpending = cardSpending;
    }
    for (const list of this.byAccount.values()) list.sort((a, b) => LocalDate.compare(a.occurredOn, b.occurredOn));
    return this.byAccount;
  }

  /** Gera um mês e devolve o total gasto no cartão (para a fatura do mês seguinte). */
  private month(start: LocalDate, billToPay: number, index: number): number {
    const day = (d: number) => start.addDays(d - 1);

    // Renda: bolsa mensal e cliente PJ, repassado no mesmo dia para a carteira Pix.
    this.add('demo-aurora-pf', day(5), 120_000, 'PAGAMENTO BOLSA PESQUISA', 'other', {
      document: SCHOLARSHIP_PAYER,
      category: 'renda.salario-bolsa',
    });
    this.add('demo-aurora-pj', day(8), 150_000, 'Pix recebido Cliente Exemplo Ltda', 'pix', {
      document: CLIENT,
      category: 'renda.servicos',
    });
    this.transfer('demo-aurora-pj', 'demo-agil-pf', day(8), 150_000, COMPANY);

    // Moradia: Pix mensal para o locador (uma pessoa).
    this.add('demo-agil-pf', day(10), -65_000, 'Pix enviado', 'pix', { document: LANDLORD, category: 'pessoas.pix' });

    // Carteira de corridas: recargas, corridas (provedor erra a categoria), rendimento e cashback.
    for (const d of [9, 23]) this.transfer('demo-agil-pf', 'demo-movimento', day(d), 15_000, PERSON);
    for (let i = 0; i < 9; i++) {
      // O provedor real também coloca o CPF do próprio usuário como contraparte das corridas.
      this.add('demo-movimento', day(1 + Math.floor(this.rnd() * 27)), -this.cents(14, 38), 'Corridas', 'other', {
        document: PERSON,
        category: 'lazer.esportes',
      });
    }
    for (let d = 2; d <= 28; d += 3) this.add('demo-movimento', day(d), this.cents(0.1, 0.45), 'Lucro', 'yield', {});
    this.add('demo-movimento', day(27), this.cents(2, 6), 'Recompensas', 'cashback', { category: 'renda.cashback' });

    // Pix para comerciantes (mercado).
    for (let i = 0; i < 4; i++) {
      this.add('demo-agil-pf', day(2 + Math.floor(this.rnd() * 25)), -this.cents(18, 95), 'Pix enviado', 'pix', {
        document: MERCHANTS[i % MERCHANTS.length] as string,
        category: 'alimentacao.mercado',
      });
    }

    // Cartão: compras do dia a dia, assinatura, telefone, IOF e parcelamentos.
    let spending = 0;
    const card = (d: number, cents: number, description: string, category: string, extra = {}) => {
      spending += cents;
      this.add('demo-aurora-card', day(d), -cents, description, 'card_purchase', { category, ...extra });
    };
    for (let i = 0; i < 5; i++)
      card(2 + Math.floor(this.rnd() * 26), this.cents(25, 160), 'SUPERMERCADO EXEMPLO', 'alimentacao.mercado');
    for (let i = 0; i < 4; i++)
      card(2 + Math.floor(this.rnd() * 26), this.cents(18, 70), 'LANCHONETE EXEMPLO', 'alimentacao.restaurantes');
    for (let i = 0; i < 6; i++)
      card(2 + Math.floor(this.rnd() * 26), this.cents(12, 40), 'APP DE TRANSPORTE', 'transporte.app');
    card(12, 3_990, 'STREAMING EXEMPLO', 'assinaturas.streaming');
    card(15, 5_999, 'OPERADORA EXEMPLO', 'assinaturas.telefone');
    if (index % 4 === 1) {
      spending += 321;
      this.add('demo-aurora-card', day(16), -321, 'IOF COMPRA INTERNACIONAL', 'fee', {
        category: 'financeiro.impostos',
      });
    }
    if (index === 6) this.add('demo-aurora-card', day(19), 8_990, 'ESTORNO LOJA ONLINE EXEMPLO', 'refund', {});
    spending += this.installments(start, day);

    // Fatura do mês anterior: carteira → banco (Pix para si) → pagamento da fatura.
    this.transfer('demo-agil-pf', 'demo-aurora-pf', day(18), billToPay, PERSON);
    this.add('demo-aurora-pf', day(20), -billToPay, 'PAGAMENTO FATURA CARTAO', 'bill_payment', {});
    this.add('demo-aurora-card', day(20), billToPay, 'PAGAMENTO RECEBIDO', 'bill_payment', {});

    // Custos financeiros.
    this.add('demo-aurora-pf', day(1), -1_290, 'TARIFA PACOTE DE SERVICOS', 'fee', { category: 'financeiro.tarifas' });

    // Empate proposital (uma vez): a mesma quantia sai do banco e entra em duas contas no mesmo dia.
    if (index === 3) {
      this.add('demo-aurora-pf', day(14), -20_000, 'Pix enviado', 'pix', { document: PERSON });
      this.add('demo-agil-pf', day(14), 20_000, 'Pix recebido', 'pix', { document: PERSON });
      this.add('demo-movimento', day(14), 20_000, 'Depósito', 'pix', { document: PERSON });
    }
    return spending;
  }

  /** Três compras parceladas: uma anterior ao histórico (10x), uma com total informado (3x) e uma em curso (6x). */
  private installments(start: LocalDate, day: (d: number) => LocalDate): number {
    const first = LocalDate.of(this.today.year, this.today.month, 1).addMonths(-12);
    const plans = [
      {
        startsAt: first.addMonths(-3),
        total: 10,
        cents: 12_000,
        description: 'LOJA DE MOVEIS EXEMPLO',
        category: 'moradia.casa',
      },
      {
        startsAt: first.addMonths(4),
        total: 3,
        cents: 3_334,
        totalAmount: 10_000,
        description: 'LIVRARIA EXEMPLO',
        category: 'educacao.livros',
      },
      {
        startsAt: first.addMonths(10),
        total: 6,
        cents: 25_000,
        description: 'ELETRONICOS EXEMPLO',
        category: 'compras.eletronicos',
      },
    ];
    let spent = 0;
    for (const plan of plans) {
      const number = (start.year - plan.startsAt.year) * 12 + (start.month - plan.startsAt.month) + 1;
      if (number < 1 || number > plan.total) continue;
      const cents = plan.totalAmount
        ? (Money.fromCents(plan.totalAmount).allocate(plan.total)[number - 1]?.cents ?? plan.cents)
        : plan.cents;
      spent += cents;
      this.add('demo-aurora-card', day(12), -cents, plan.description, 'card_purchase', {
        category: plan.category,
        installment: {
          number,
          total: plan.total,
          ...(plan.totalAmount ? { totalAmount: Money.fromCents(plan.totalAmount) } : {}),
          ...(number === 1 ? { purchaseDate: day(12) } : {}),
        },
      });
    }
    return spent;
  }

  private transfer(from: string, to: string, on: LocalDate, cents: number, receiverDocument: string): void {
    const payer = ACCOUNTS.find((a) => a.externalId === from)?.holderDocument as string;
    this.add(from, on, -cents, 'Pix enviado', 'pix', { document: receiverDocument });
    this.add(to, on, cents, 'Pix recebido', 'pix', { document: payer });
  }

  private add(
    accountExternalId: string,
    occurredOn: LocalDate,
    cents: number,
    description: string,
    paymentMethod: ProviderTransaction['paymentMethod'],
    extra: { document?: string; category?: string; installment?: ProviderTransaction['installment'] },
  ): void {
    if (occurredOn.isAfter(this.today)) return;
    const pending = accountExternalId === 'demo-aurora-card' && this.today.daysBetween(occurredOn) <= 7;
    const externalId = `${accountExternalId}-${String(++this.counter).padStart(5, '0')}`;
    this.byAccount.get(accountExternalId)?.push({
      externalId,
      accountExternalId,
      occurredOn,
      amount: Money.fromCents(cents),
      description,
      paymentMethod,
      status: pending ? 'pending' : 'posted',
      ...(extra.document ? { counterparty: { document: extra.document } } : {}),
      ...(extra.category ? { providerCategoryId: extra.category } : {}),
      ...(extra.installment ? { installment: extra.installment } : {}),
      raw: { demo: true, externalId },
    });
  }

  private cents(minReais: number, maxReais: number): number {
    return Math.round((minReais + this.rnd() * (maxReais - minReais)) * 100);
  }
}
