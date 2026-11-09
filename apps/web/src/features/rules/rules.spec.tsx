import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { aTransaction, FakeFinanceApi } from '../../../test/finance-fixtures';
import { CategoriesPage } from '../categories/CategoriesPage';
import { TransactionsPage } from '../transactions/TransactionsPage';
import { RulesPage } from './RulesPage';

afterEach(() => vi.restoreAllMocks());

describe('categorizing in sequence and teaching rules', () => {
  const twoUncategorized = () => {
    const finance = new FakeFinanceApi();
    finance.pages = [
      {
        items: [
          aTransaction({ id: 'a', description: 'SUPERMERCADO EXEMPLO 0412' }),
          aTransaction({ id: 'b', description: 'Padaria Exemplo' }),
        ],
        nextCursor: null,
      },
    ];
    return finance;
  };

  it('after a correction, offers a rule for similar ones with a preview, and moves the focus to the next one', async () => {
    const finance = twoUncategorized();
    renderWithServices(<TransactionsPage />, { finance, route: '/transacoes?periodo=all' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Mudar categoria de SUPERMERCADO EXEMPLO 0412/ }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Categoria de SUPERMERCADO EXEMPLO 0412' }),
      'alimentacao.mercado',
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Mudar categoria de Padaria Exemplo/ })),
    );
    const suggestion = await screen.findByRole('region', { name: 'Criar regra' });
    expect(within(suggestion).getByLabelText('Texto')).toHaveValue('supermercado exemplo');
    expect(await within(suggestion).findByText(/Mudaria 3 transações dos últimos 12 meses/)).toBeInTheDocument();

    await user.click(within(suggestion).getByRole('button', { name: 'Criar regra' }));
    expect(await within(suggestion).findByRole('status')).toHaveTextContent(
      'Regra criada: 3 transações recategorizadas.',
    );
    expect(finance.sent.at(-1)).toMatchObject({
      categoryId: 'alimentacao.mercado',
      descriptionContains: 'supermercado exemplo',
      applyToExisting: true,
    });
  });
});

describe('RulesPage', () => {
  it('turns a rule off, changes its category and reorders by swapping priorities', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<RulesPage />, { finance, route: '/regras' });
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: 'Regras' });
    const market = within(list).getByText('Mercado', { selector: 'strong' }).closest('li') as HTMLElement;
    expect(market).toHaveTextContent('descrição contém “supermercado” → Alimentação › Mercado');

    await user.click(within(market).getByRole('checkbox', { name: 'Ligada' }));
    await waitFor(() => expect(finance.calls).toContain('update-rule:r1'));
    expect(finance.sent.at(-1)).toEqual({ enabled: false });
    expect(await screen.findByRole('status')).toHaveTextContent('1 transação recategorizada.');

    await user.click(screen.getByRole('button', { name: 'Subir Mercado' }));
    await waitFor(() => expect(finance.sent.slice(-2)).toEqual([{ priority: 50 }, { priority: 100 }]));
  });

  it('deletes user rules after confirming; default rules can only be turned off', async () => {
    const finance = new FakeFinanceApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithServices(<RulesPage />, { finance, route: '/regras' });
    const list = await screen.findByRole('list', { name: 'Regras' });
    const corridas = within(list).getByText('Corridas', { selector: 'strong' }).closest('li') as HTMLElement;
    expect(within(corridas).queryByRole('button', { name: 'Excluir' })).toBeNull();
    const market = within(list).getByText('Mercado', { selector: 'strong' }).closest('li') as HTMLElement;
    await userEvent.setup().click(within(market).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(finance.calls).toContain('delete-rule:r1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Regra excluída. 2 transações recategorizadas.');
  });

  it('creates a rule after seeing its impact', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<RulesPage />, { finance, route: '/regras' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nova regra' }));
    const form = screen.getByRole('form', { name: 'Nova regra' });
    await user.type(within(form).getByLabelText('Texto'), 'padaria');
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'Categoria da regra' }),
      'alimentacao.delivery',
    );
    await user.click(within(form).getByRole('button', { name: 'Ver impacto' }));
    expect(await within(form).findByRole('status')).toHaveTextContent('Mudaria 3 transações dos últimos 12 meses');
    await user.click(within(form).getByRole('button', { name: 'Criar regra' }));
    await waitFor(() => expect(finance.calls).toContain('create-rule'));
    expect(finance.sent.at(-1)).toMatchObject({ descriptionContains: 'padaria', categoryId: 'alimentacao.delivery' });
  });
});

describe('CategoriesPage', () => {
  it('creates a subcategory, renames and archives', async () => {
    const finance = new FakeFinanceApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithServices(<CategoriesPage />, { finance, route: '/categorias' });
    const user = userEvent.setup();
    const food = await screen.findByRole('article', { name: 'Alimentação' });
    await user.type(within(food).getByRole('textbox', { name: 'Nova subcategoria em Alimentação' }), 'Feira');
    await user.click(within(food).getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(finance.calls).toContain('create-category'));
    expect(finance.sent.at(-1)).toEqual({ name: 'Feira', kind: 'expense', parentId: 'alimentacao' });

    const name = within(food).getByRole('textbox', { name: 'Nome de Mercado' });
    await user.clear(name);
    await user.type(name, 'Mercado e feira');
    await user.click(within(name.closest('li') as HTMLElement).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(finance.calls).toContain('update-category:alimentacao.mercado'));

    await user.click(
      within(screen.getByRole('article', { name: 'Alimentação' })).getAllByRole('button', {
        name: 'Arquivar',
      })[0] as HTMLElement,
    );
    await waitFor(() => expect(finance.sent.at(-1)).toEqual({ archived: true }));
  });
  it('merges a category into another of the same kind after confirming', async () => {
    const finance = new FakeFinanceApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithServices(<CategoriesPage />, { finance, route: '/categorias' });
    const select = await screen.findByRole('combobox', { name: 'Mesclar Delivery em' });
    expect(within(select).queryByRole('option', { name: /Serviços e freelas/ })).toBeNull();
    await userEvent.setup().selectOptions(select, 'alimentacao.mercado');
    await waitFor(() => expect(finance.calls).toContain('merge-category:alimentacao.delivery:alimentacao.mercado'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Mesclada: 7 transações e 1 regra mudaram de categoria.',
    );
  });
});
