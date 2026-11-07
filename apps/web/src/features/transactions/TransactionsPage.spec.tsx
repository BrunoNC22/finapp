import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { aTransaction, FakeFinanceApi } from '../../../test/finance-fixtures';
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
