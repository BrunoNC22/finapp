import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { FakeFinanceApi } from '../../../test/finance-fixtures';
import { GoalsPage } from './GoalsPage';

const plain = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

describe('GoalsPage', () => {
  it('compares when each goal fits in every income scenario', async () => {
    renderWithServices(<GoalsPage />);
    const table = await screen.findByRole('table', { name: /Mês em que cada meta começa/ });
    const bike = within(table).getByRole('row', { name: /Bicicleta elétrica/ });
    expect(
      within(bike)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['não cabe', 'em dez/26', 'já cabe']);
  });

  it('shows, per scenario, when a goal starts or what it would take to fit', async () => {
    renderWithServices(<GoalsPage />);
    const list = await screen.findByRole('list', { name: 'Metas em ordem' });
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('A renda cai durante as parcelas');
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Piso' }));
    const bike = within(list).getAllByRole('listitem')[0] as HTMLElement;
    expect(plain(bike.textContent)).toMatch(/Faltam R\$ 500,00\/mês/);
    expect(plain(bike.textContent)).toMatch(/gastar R\$ 120,00 a menos em Mercado/);
    expect(plain(bike.textContent)).toMatch(/No orçamento: \+R\$ 235,00\/mês enquanto paga.*\(no lugar de Delivery\)/);
  });

  it('shows how much needs to be earned, also with a deadline', async () => {
    const { finance } = renderWithServices(<GoalsPage />);
    const list = await screen.findByRole('list', { name: 'Renda necessária por meta' });
    expect(plain(list.textContent)).toMatch(/Carteira de motorista.*R\$ 1\.950,00\/mês · começa em fev\/27/);
    await userEvent.setup().type(screen.getByLabelText('Prazo para as metas'), '2027-06');
    await waitFor(() =>
      expect(plain(screen.getByRole('list', { name: 'Renda necessária por meta' }).textContent)).toMatch(
        /R\$ 2\.600,00/,
      ),
    );
    expect(finance.planQueries.at(-1)).toMatchObject({ deadline: '2027-06' });
  });

  it('reorders goals', async () => {
    const { finance } = renderWithServices(<GoalsPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Adiar Bicicleta elétrica' }));
    await waitFor(() => expect(finance.calls).toContain('reorder:g2,g1'));
  });

  it('creates a financed goal with a live installment preview and the right command', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<GoalsPage />, { finance });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nova meta' }));
    const form = screen.getByRole('form', { name: 'Nova meta' });
    await user.type(within(form).getByLabelText('Nome'), 'Moto');
    await user.type(within(form).getByLabelText('Valor (R$)'), '24.000');
    await user.selectOptions(within(form).getByLabelText('Como pagar'), 'loan');
    await user.type(within(form).getByLabelText('Entrada (R$)'), '4.800');
    await user.clear(within(form).getByLabelText('Parcelas'));
    await user.type(within(form).getByLabelText('Parcelas'), '48');
    await user.click(within(form).getByRole('button', { name: 'Adicionar custo mensal' }));
    await user.type(within(form).getByLabelText('Nome do custo'), 'Seguro e gasolina');
    await user.type(within(form).getByLabelText('Valor por mês'), '530');

    expect(plain(within(form).getByRole('status').textContent)).toMatch(/48x de R\$ 624,68/);
    await user.click(within(form).getByRole('button', { name: 'Adicionar meta' }));
    await waitFor(() => expect(finance.calls).toContain('create-goal'));
    expect(finance.sent.at(-1)).toEqual({
      name: 'Moto',
      kind: 'purchase',
      priceCents: 2_400_000,
      downPaymentCents: 480_000,
      oneTimeCostsCents: 0,
      financing: { kind: 'loan', installments: 48, monthlyRate: 0.0199 },
      recurringCosts: [{ name: 'Seguro e gasolina', monthlyCents: 53_000 }],
    });
  });
});
