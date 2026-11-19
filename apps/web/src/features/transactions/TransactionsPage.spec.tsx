import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { aTransaction, brl, FakeFinanceApi } from '../../../test/finance-fixtures';
import { TransactionsPage } from './TransactionsPage';

describe('TransactionsPage', () => {
  it('searches with the filters in the URL', async () => {
    const { finance } = renderWithServices(<TransactionsPage />, {
      route: '/transacoes?periodo=2026-10&categoria=none&forma=pix',
    });
    expect(await screen.findByText('Restaurante Exemplo')).toBeInTheDocument();
    expect(finance.searches[0]).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      uncategorized: true,
      paymentMethod: 'pix',
      limit: 50,
    });
  });

  it('shows the payment badge and changes the category right on the row', async () => {
    const finance = new FakeFinanceApi();
    finance.pages = [
      {
        items: [
          aTransaction({
            id: 'p1',
            description: 'Loja Exemplo',
            installment: {
              number: 2,
              total: 6,
              totalAmount: { cents: -60000, currency: 'BRL' },
              totalAmountIsEstimated: false,
            },
          }),
        ],
        nextCursor: null,
      },
    ];
    renderWithServices(<TransactionsPage />, { finance, route: '/transacoes?periodo=all' });
    expect(await screen.findByText('Parcela 2/6')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Mudar categoria de Loja Exemplo: Sem categoria/ }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Categoria de Loja Exemplo' }),
      'alimentacao.delivery',
    );
    await waitFor(() => expect(finance.calls).toContain('categorize:p1:alimentacao.delivery'));
    expect(
      await screen.findByRole('button', { name: /Mudar categoria de Loja Exemplo: Alimentação › Delivery/ }),
    ).toBeInTheDocument();
  });

  it('explains the classification and lets the user ignore a transaction', async () => {
    const { finance } = renderWithServices(<TransactionsPage />, { route: '/transacoes?periodo=all' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Restaurante Exemplo/, expanded: false }));
    expect(screen.getByText('Gasto (valor negativo, saiu da conta).')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Contar como' }), 'ignored');
    await waitFor(() => expect(finance.calls).toContain('classify:t1:ignored'));
  });

  it('pairs a transaction with the other side of a transfer between the accounts', async () => {
    const finance = new FakeFinanceApi();
    finance.pages = [
      {
        items: [
          aTransaction({ id: 'out', description: 'Pix enviado', amount: brl(-5000), paymentMethod: 'pix' }),
          aTransaction({
            id: 'in',
            accountId: 'cartao',
            occurredOn: '2026-10-06',
            description: 'Pix recebido',
            amount: brl(5000),
            classification: 'income',
          }),
          aTransaction({ id: 'same-account', description: 'Devolução', amount: brl(5000) }),
          aTransaction({ id: 'other-value', accountId: 'cartao', description: 'Outro valor', amount: brl(4000) }),
        ],
        nextCursor: null,
      },
    ];
    renderWithServices(<TransactionsPage />, { finance, route: '/transacoes?periodo=all' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Pix enviado/, expanded: false }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Contar como' }), 'internal_transfer');

    const picker = await screen.findByRole('group', { name: 'Outra ponta da transferência' });
    expect(finance.searches.at(-1)).toEqual({ from: '2026-09-28', to: '2026-10-12', limit: 200 });
    const candidates = await within(picker).findAllByRole('button', { name: /^Ligar a/ });
    expect(candidates).toHaveLength(1);
    await user.click(within(picker).getByRole('button', { name: /Ligar a Pix recebido/ }));
    await waitFor(() => expect(finance.calls).toContain('classify:out:internal_transfer:in'));
  });

  it('marks a transfer whose other side is in an account outside the app', async () => {
    const { finance } = renderWithServices(<TransactionsPage />, { route: '/transacoes?periodo=all' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Restaurante Exemplo/, expanded: false }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Contar como' }), 'internal_transfer');
    expect(await screen.findByText(/Nenhuma transação de outra conta/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'A outra conta não está no app' }));
    await waitFor(() => expect(finance.calls).toContain('classify:t1:internal_transfer'));
  });

  it('loads the next page with the cursor', async () => {
    const finance = new FakeFinanceApi();
    finance.pages = [
      { items: [aTransaction({ id: 'a', description: 'Primeira' })], nextCursor: '1' },
      { items: [aTransaction({ id: 'b', description: 'Segunda' })], nextCursor: null },
    ];
    renderWithServices(<TransactionsPage />, { finance, route: '/transacoes?periodo=all' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Segunda')).toBeInTheDocument();
    expect(finance.searches.at(-1)?.cursor).toBe('1');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('searches by text after the user stops typing', async () => {
    const { finance } = renderWithServices(<TransactionsPage />, { route: '/transacoes?periodo=all' });
    await userEvent.setup().type(await screen.findByRole('searchbox', { name: 'Buscar' }), 'mercado');
    await waitFor(() => expect(finance.searches.at(-1)?.q).toBe('mercado'), { timeout: 2000 });
  });

  it('says so when nothing matches', async () => {
    const finance = new FakeFinanceApi();
    finance.pages = [{ items: [], nextCursor: null }];
    renderWithServices(<TransactionsPage />, { finance });
    expect(await screen.findByText('Nenhuma transação com estes filtros.')).toBeInTheDocument();
  });
});
