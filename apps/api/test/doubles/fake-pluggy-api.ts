import type {
  PluggyAccount,
  PluggyItem,
  PluggyTransaction,
} from '../../src/modules/ledger/infrastructure/pluggy/pluggy-types.js';
import { SYNTHETIC_CNPJ_DIGITS, SYNTHETIC_CPF_DIGITS } from '../fixtures/synthetic-documents.js';

/**
 * API da Pluggy FALSA, escrita à mão a partir da documentação pública (nunca de respostas reais).
 * Serve como `fetch` injetável: autenticação, items, contas e transações paginadas por cursor.
 * Permite simular chave expirada, erros transitórios e inspecionar as requisições (spy).
 */
export class FakePluggyApi {
  readonly requests: string[] = [];
  readonly clientId = 'fake-client';
  readonly clientSecret = 'fake-secret';
  private validKey = 'key-1';
  private keyCounter = 1;
  private failures: number[] = [];
  readonly pageSize = 2;

  readonly items: PluggyItem[] = [
    {
      id: 'item-bank',
      status: 'UPDATED',
      executionStatus: 'SUCCESS',
      consentExpiresAt: '2027-11-07T00:00:00.000Z',
      lastUpdatedAt: '2026-11-07T10:00:00.000Z',
    },
    {
      id: 'item-company',
      status: 'LOGIN_ERROR',
      executionStatus: 'USER_AUTHORIZATION_EXPIRED',
      error: { code: 'USER_AUTHORIZATION_EXPIRED' },
    },
  ];

  readonly accounts: PluggyAccount[] = [
    {
      id: 'pl-bank',
      itemId: 'item-bank',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      name: 'BANCO FICTICIO S.A.',
      balance: 1500.25,
      taxNumber: SYNTHETIC_CPF_DIGITS,
    },
    {
      id: 'pl-card',
      itemId: 'item-bank',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      name: 'GOLD',
      balance: 410.1,
      taxNumber: null,
      creditData: { creditLimit: 2000 },
    },
    {
      id: 'pl-company',
      itemId: 'item-company',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      name: 'BANCO FICTICIO EMPRESAS',
      balance: 10,
      taxNumber: SYNTHETIC_CNPJ_DIGITS,
    },
  ];

  readonly transactions: PluggyTransaction[] = [
    {
      id: 'pt-1',
      accountId: 'pl-bank',
      date: '2026-10-05T13:00:00.000Z',
      description: 'PAGAMENTO BOLSA',
      amount: 1200,
      type: 'CREDIT',
      status: 'POSTED',
      operationType: 'OUTROS',
      categoryId: '01010000',
    },
    {
      id: 'pt-2',
      accountId: 'pl-bank',
      date: '2026-10-06T13:00:00.000Z',
      description: 'Pix enviado',
      amount: -80,
      type: 'DEBIT',
      status: 'POSTED',
      operationType: 'PIX',
      categoryId: '05070000',
      paymentData: { paymentMethod: 'PIX', receiver: { documentNumber: { type: 'CNPJ', value: '45678901000123' } } },
    },
    {
      id: 'pt-3',
      accountId: 'pl-bank',
      date: '2026-10-20T13:00:00.000Z',
      description: 'Pagamento efetuado - Pagamento Fatura',
      amount: -350,
      type: 'DEBIT',
      status: 'POSTED',
      operationType: 'BOLETO',
      categoryId: '05100000',
    },
    {
      id: 'pt-4',
      accountId: 'pl-card',
      date: '2026-10-08T15:00:00.000Z',
      description: 'SUPERMERCADO FICTICIO',
      amount: 120.5,
      type: 'DEBIT',
      status: 'POSTED',
      operationType: 'PAGAMENTO',
      categoryId: '10000000',
    },
    {
      id: 'pt-5',
      accountId: 'pl-card',
      date: '2026-10-09T15:00:00.000Z',
      description: 'LOJA FICTICIA',
      amount: 50,
      type: 'DEBIT',
      status: 'POSTED',
      operationType: 'PAGAMENTO',
      categoryId: '08000000',
      creditCardMetadata: { installmentNumber: 1, totalInstallments: 3, purchaseDate: '2026-10-09T15:00:00.000Z' },
    },
    {
      id: 'pt-6',
      accountId: 'pl-card',
      date: '2026-10-21T15:00:00.000Z',
      description: 'Pagamento recebido',
      amount: -350,
      type: 'CREDIT',
      status: 'POSTED',
      operationType: 'PAGAMENTO_FATURA',
      categoryId: '05100000',
    },
    {
      id: 'pt-7',
      accountId: 'pl-card',
      date: '2026-11-05T15:00:00.000Z',
      description: 'APP DE TRANSPORTE',
      amount: 23.9,
      type: 'DEBIT',
      status: 'PENDING',
      operationType: 'PAGAMENTO',
      categoryId: '19010000',
    },
  ];

  /** Invalida a chave atual: a próxima requisição recebe 401. */
  expireKey(): void {
    this.validKey = `revoked-${this.keyCounter}`;
  }

  /** As próximas respostas (de qualquer rota) falham com estes status, em ordem. */
  failNext(...statuses: number[]): void {
    this.failures.push(...statuses);
  }

  readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const { pathname, searchParams } = new URL(url);
    this.requests.push(`${init?.method ?? 'GET'} ${pathname}${searchParams.size ? `?${searchParams}` : ''}`);
    const failure = this.failures.shift();
    if (failure) return json({ message: 'falha simulada' }, failure);

    if (pathname === '/auth' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { clientId: string; clientSecret: string };
      if (body.clientId !== this.clientId || body.clientSecret !== this.clientSecret)
        return json({ message: 'unauthorized' }, 401);
      this.validKey = `key-${++this.keyCounter}`;
      return json({ apiKey: this.validKey });
    }
    if (new Headers(init?.headers).get('X-API-KEY') !== this.validKey) return json({ message: 'unauthorized' }, 401);

    const item = /^\/items\/([^/]+)$/.exec(pathname);
    if (item) return this.found(this.items.find((i) => i.id === item[1]));
    if (pathname === '/accounts')
      return json({ results: this.accounts.filter((a) => a.itemId === searchParams.get('itemId')) });
    const account = /^\/accounts\/([^/]+)$/.exec(pathname);
    if (account) return this.found(this.accounts.find((a) => a.id === account[1]));
    if (pathname === '/v2/transactions') return this.transactionsPage(searchParams);
    return json({ message: 'not found' }, 404);
  };

  private transactionsPage(params: URLSearchParams): Response {
    const from = params.get('dateFrom') ?? '0000-00-00';
    const to = params.get('dateTo') ?? '9999-99-99';
    const all = this.transactions.filter(
      (t) => t.accountId === params.get('accountId') && t.date.slice(0, 10) >= from && t.date.slice(0, 10) <= to,
    );
    const offset = Number(params.get('after') ?? 0);
    const page = all.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;
    const next =
      nextOffset < all.length
        ? `?${new URLSearchParams({ accountId: params.get('accountId') ?? '', after: String(nextOffset) })}`
        : null;
    return json({ results: page, next });
  }

  private found(value: unknown): Response {
    return value ? json(value) : json({ message: 'not found' }, 404);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
