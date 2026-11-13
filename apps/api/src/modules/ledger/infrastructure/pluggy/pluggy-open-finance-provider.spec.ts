import { describe, expect, it } from 'vitest';
import { openFinanceProviderContract } from '../../../../../test/contracts/open-finance-provider.contract.js';
import { FakePluggyApi } from '../../../../../test/doubles/fake-pluggy-api.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { PluggyApiError, PluggyClient } from './pluggy-client.js';
import { PluggyOpenFinanceProvider } from './pluggy-open-finance-provider.js';

const range = { from: LocalDate.parse('2026-10-01'), to: LocalDate.parse('2026-11-07') };
const noWait = async () => {};

function make(api = new FakePluggyApi(), itemIds = ['item-bank', 'item-company']) {
  const client = new PluggyClient({
    clientId: api.clientId,
    clientSecret: api.clientSecret,
    fetch: api.fetch,
    sleep: noWait,
  });
  return { api, client, provider: new PluggyOpenFinanceProvider(client, itemIds) };
}

openFinanceProviderContract('Pluggy (API falsa)', async () => make().provider, range);

describe('PluggyOpenFinanceProvider', () => {
  it('maps connections, naming the institution by its bank account and reporting expired consents', async () => {
    const connections = await make().provider.listConnections();
    expect(connections).toEqual([
      expect.objectContaining({
        id: 'item-bank',
        institutionName: 'Banco Ficticio S.A.',
        status: 'active',
        consentExpiresAt: new Date('2027-11-07T00:00:00.000Z'),
      }),
      expect.objectContaining({ id: 'item-company', status: 'expired' }),
    ]);
  });

  it('lists accounts of a connection, with the card inheriting the holder document', async () => {
    const accounts = await make().provider.listAccounts('item-bank');
    expect(accounts.map((a) => [a.kind, a.holderDocument])).toEqual([
      ['checking', expect.any(String)],
      ['credit_card', accounts[0]?.holderDocument],
    ]);
  });

  it('follows the cursor through every page and asks only for the requested period', async () => {
    const { api, provider } = make();
    await provider.listAccounts('item-bank');
    const txs = await provider.listTransactions('pl-card', range);

    expect(txs.map((t) => t.externalId)).toEqual(['pt-4', 'pt-5', 'pt-6', 'pt-7']);
    expect(api.requests.filter((r) => r.includes('/v2/transactions'))).toEqual([
      'GET /v2/transactions?accountId=pl-card&dateFrom=2026-10-01&dateTo=2026-11-07',
      'GET /v2/transactions?accountId=pl-card&after=2',
    ]);
  });

  it('normalizes card transactions (sign, bill payment, installment, pending)', async () => {
    const { provider } = make();
    await provider.listAccounts('item-bank');
    const [purchase, installment, billPayment, pending] = await provider.listTransactions('pl-card', range);

    expect(purchase?.amount.cents).toBe(-12050);
    expect(installment?.installment).toMatchObject({ number: 1, total: 3 });
    expect(billPayment).toMatchObject({ paymentMethod: 'bill_payment' });
    expect(billPayment?.amount.cents).toBe(35000);
    expect(pending?.status).toBe('pending');
  });

  it('loads an unknown account on demand', async () => {
    const txs = await make().provider.listTransactions('pl-bank', range);
    expect(txs).toHaveLength(3);
  });
});

describe('PluggyClient', () => {
  it('authenticates once and reuses the api key', async () => {
    const { api, provider } = make();
    await provider.listConnections();
    expect(api.requests.filter((r) => r === 'POST /auth')).toHaveLength(1);
  });

  it('renews the api key transparently when it expires', async () => {
    const { api, provider } = make();
    await provider.listAccounts('item-bank');
    api.expireKey();

    await expect(provider.listAccounts('item-bank')).resolves.toHaveLength(2);
    expect(api.requests.filter((r) => r === 'POST /auth')).toHaveLength(2);
  });

  it('renews the api key when an expired key is refused with 403 (as the real Pluggy does)', async () => {
    const { api, provider } = make();
    await provider.listConnections();
    api.expireKey(403);

    await expect(provider.listConnections()).resolves.toHaveLength(2);
    expect(api.requests.filter((r) => r === 'POST /auth')).toHaveLength(2);
  });

  it('does not loop when a fresh key is also refused: the 403 surfaces with a safe message', async () => {
    const { api, client } = make();
    await client.get('/items/item-bank');
    api.expireKey(403);
    api.refuseNextKeys();

    await expect(client.get('/items/item-bank')).rejects.toThrow('Pluggy respondeu 403 em /items/item-bank');
    expect(api.requests.filter((r) => r === 'POST /auth')).toHaveLength(2);
  });

  it('retries rate limits and server errors, then succeeds', async () => {
    const { api, provider } = make();
    api.failNext(429, 503);
    await expect(provider.listAccounts('item-bank')).resolves.toHaveLength(2);
  });

  it('gives up after the retries with a safe message (no query string, no body)', async () => {
    const { api, provider } = make();
    await provider.listAccounts('item-bank');
    api.failNext(500, 500, 500, 500);

    const error = await provider.listTransactions('pl-card', range).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PluggyApiError);
    expect((error as Error).message).toBe('Pluggy respondeu 500 em /v2/transactions');
  });

  it('fails clearly with wrong credentials', async () => {
    const api = new FakePluggyApi();
    const client = new PluggyClient({ clientId: 'wrong', clientSecret: 'wrong', fetch: api.fetch, sleep: noWait });
    await expect(client.get('/items/item-bank')).rejects.toThrow('autenticação na Pluggy falhou (401)');
  });
});
