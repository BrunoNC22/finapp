import type { GoalDto } from '@finapp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { FakeFinanceApi, GOALS } from '../../../test/finance-fixtures';
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
      tradeIns: [],
    });
  });

  it('creates a goal that sells an earlier goal asset and one already owned, with the asset category', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<GoalsPage />, { finance });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nova meta' }));
    const form = screen.getByRole('form', { name: 'Nova meta' });
    await user.type(within(form).getByLabelText('Nome'), 'Moto');
    await user.type(within(form).getByLabelText('Valor (R$)'), '20.000');
    await user.selectOptions(within(form).getByLabelText('Categoria do bem'), 'vehicle');

    await user.click(within(form).getByRole('button', { name: 'Adicionar bem vendido' }));
    await user.click(within(form).getByRole('button', { name: 'Adicionar bem vendido' }));
    const [bike, helmet] = within(form).getAllByLabelText('Bem vendido') as HTMLSelectElement[];
    // as metas de compra anteriores na fila, e "um bem que já tenho"
    expect([...(bike as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      'Bem da meta: Bicicleta elétrica',
      'Bem da meta: Carteira de motorista',
      'Um bem que já tenho',
    ]);
    await user.selectOptions(bike as HTMLSelectElement, 'g1');
    await user.selectOptions(helmet as HTMLSelectElement, 'owned');
    const [bikeRate, helmetRate] = within(form).getAllByLabelText('Desvalorização ao ano (%)');
    await user.type(bikeRate as HTMLElement, '20');
    await user.type(helmetRate as HTMLElement, '0');
    await user.type(within(form).getByLabelText('Nome do bem'), 'Capacete');
    await user.type(within(form).getByLabelText('Valor hoje (R$)'), '300');

    await user.click(within(form).getByRole('button', { name: 'Adicionar meta' }));
    await waitFor(() => expect(finance.calls).toContain('create-goal'));
    expect(finance.sent.at(-1)).toMatchObject({
      name: 'Moto',
      category: { kind: 'vehicle' },
      tradeIns: [
        { source: { kind: 'goal', goalId: 'g1' }, annualDepreciationRate: 0.2 },
        { source: { kind: 'owned', name: 'Capacete', currentValueCents: 30_000 }, annualDepreciationRate: 0 },
      ],
    });
  });

  it('asks for the depreciation and for the name and value of an owned asset', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<GoalsPage />, { finance });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nova meta' }));
    const form = screen.getByRole('form', { name: 'Nova meta' });
    await user.type(within(form).getByLabelText('Nome'), 'PC novo');
    await user.click(within(form).getByRole('button', { name: 'Adicionar bem vendido' }));
    await user.selectOptions(within(form).getByLabelText('Bem vendido'), 'owned');
    await user.click(within(form).getByRole('button', { name: 'Adicionar meta' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(/desvalorização/);
    expect(finance.calls).not.toContain('create-goal');
  });

  it('only offers to sell goals that come earlier in the queue and that no other goal sells', async () => {
    const finance = new FakeFinanceApi();
    finance.goalList = [
      ...GOALS,
      {
        ...(GOALS[1] as GoalDto),
        id: 'g3',
        name: 'Moto',
        tradeIns: [{ source: { kind: 'goal', goalId: 'g1' }, annualDepreciationRate: 0.2 }],
      },
    ];
    renderWithServices(<GoalsPage />, { finance });
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Editar' }))[1] as HTMLElement);
    const form = screen.getByRole('form', { name: 'Editar Carteira de motorista' });
    await user.click(within(form).getByRole('button', { name: 'Adicionar bem vendido' }));
    expect(
      [...(within(form).getByLabelText('Bem vendido') as HTMLSelectElement).options].map((o) => o.textContent),
    ).toEqual(['Um bem que já tenho']);
  });

  it('shows what a goal sells at the start and, per scenario, how much it adds after paying off the asset', async () => {
    const finance = new FakeFinanceApi();
    finance.goalList = [
      ...GOALS,
      {
        ...(GOALS[1] as GoalDto),
        id: 'g3',
        name: 'Moto',
        category: { kind: 'vehicle' },
        tradeIns: [
          { source: { kind: 'goal', goalId: 'g1' }, annualDepreciationRate: 0.2 },
          {
            source: { kind: 'owned', name: 'Capacete', currentValue: { cents: 30_000, currency: 'BRL' } },
            annualDepreciationRate: 0,
          },
        ],
      },
    ];
    const likely = finance.plan.scenarios.find((s) => s.id === 'likely');
    likely?.goals.push({
      goalId: 'g3',
      status: 'scheduled',
      startMonth: '2027-06',
      monthsWaiting: 7,
      monthlyCost: { cents: 0, currency: 'BRL' },
      monthlyCostAfterPayments: { cents: 0, currency: 'BRL' },
      alerts: [],
      levers: [],
      tradeIns: [
        {
          source: { kind: 'goal', goalId: 'g1' },
          value: { cents: 273_364, currency: 'BRL' },
          payoff: { cents: 150_000, currency: 'BRL' },
        },
        {
          source: { kind: 'owned', name: 'Capacete', currentValue: { cents: 30_000, currency: 'BRL' } },
          value: { cents: 30_000, currency: 'BRL' },
          payoff: { cents: 0, currency: 'BRL' },
        },
      ],
    });
    renderWithServices(<GoalsPage />, { finance });
    const list = await screen.findByRole('list', { name: 'Metas em ordem' });
    const moto = plain(within(list).getAllByRole('listitem')[2]?.textContent);
    expect(moto).toMatch(/Compra · Veículo\/locomoção · À vista/);
    expect(moto).toMatch(
      /Vende na largada: Bicicleta elétrica \(perde 20% ao ano\) e Capacete \(R\$ 300,00 hoje, não desvaloriza\)/,
    );
    expect(moto).toMatch(
      /Na largada: vende por R\$ 3\.033,64, quita R\$ 1\.500,00 que ainda devia → R\$ 1\.533,64 para começar/,
    );
  });
});
