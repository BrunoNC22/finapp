import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { FakeFinanceApi } from '../../../test/finance-fixtures';
import { IncomePage } from './IncomePage';

const plain = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

describe('IncomePage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows, per source, whether it paid what was expected in the month', async () => {
    const { finance } = renderWithServices(<IncomePage />, { route: '/renda?mes=2026-10' });
    const tracking = await screen.findByRole('list', { name: 'Acompanhamento das fontes' });
    expect(within(tracking).getByText('Bolsa Exemplo').closest('li')).toHaveTextContent('Pagou');
    expect(within(tracking).getByText('Freela Exemplo').closest('li')).toHaveTextContent('Pagou menos');
    expect(finance.calls).toContain('income-overview:2026-10');
    expect(screen.getByRole('img', { name: /renda projetada em cada cenário/ })).toBeInTheDocument();
  });

  it('creates a source from a suggestion, with the amount in cents and how to recognize it', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<IncomePage />, { finance, route: '/renda?mes=2026-10' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Criar fonte' }));
    const form = screen.getByRole('form', { name: 'Nova fonte de renda' });
    expect(within(form).getByLabelText('Nome')).toHaveValue('Cliente Novo');
    expect(within(form).getByLabelText('Valor por mês (R$)')).toHaveValue('300,00');
    await user.type(within(form).getByLabelText('Começa em'), '2026-08');
    await user.selectOptions(within(form).getByLabelText('Risco de parar'), 'high');
    await user.click(within(form).getByRole('button', { name: 'Adicionar fonte' }));

    await waitFor(() => expect(finance.calls).toContain('create-source'));
    expect(finance.sent.at(-1)).toEqual({
      name: 'Cliente Novo',
      kind: 'other',
      expectedMonthlyCents: 30000,
      startsOn: '2026-08',
      risk: 'high',
      status: 'active',
      matcher: { counterpartyContains: 'Cliente Novo' },
    });
  });

  it('editing a source can remove its end (sent as null) and validates the amount', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<IncomePage />, { finance });
    const user = userEvent.setup();
    const sources = await screen.findByRole('list', { name: 'Fontes de renda' });
    expect(plain(within(sources).getByText('Bolsa Exemplo').closest('li')?.textContent)).toMatch(/jan\/25 – dez\/27/);
    await user.click(
      within(within(sources).getByText('Bolsa Exemplo').closest('li') as HTMLElement).getByRole('button', {
        name: 'Editar',
      }),
    );
    const form = screen.getByRole('form', { name: 'Editar Bolsa Exemplo' });
    await user.clear(within(form).getByLabelText('Termina em (opcional)'));
    await user.clear(within(form).getByLabelText('Valor por mês (R$)'));
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Informe o valor mensal');
    await user.type(within(form).getByLabelText('Valor por mês (R$)'), '1.600');
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(finance.calls).toContain('update-source:s1'));
    expect(finance.sent.at(-1)).toMatchObject({ expectedMonthlyCents: 160000, endsOn: null });
  });

  it('deletes a source after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { finance } = renderWithServices(<IncomePage />);
    const sources = await screen.findByRole('list', { name: 'Fontes de renda' });
    await userEvent.setup().click(
      within(within(sources).getByText('Freela Exemplo').closest('li') as HTMLElement).getByRole('button', {
        name: 'Excluir',
      }),
    );
    await waitFor(() => expect(finance.calls).toContain('delete-source:s2'));
  });
});
