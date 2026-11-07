import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { aReport, FakeFinanceApi } from '../../../test/finance-fixtures';
import { addMonths, currentMonth } from '../../lib/months';
import { DashboardPage } from './DashboardPage';

const plain = (s: string | null) => (s ?? '').replace(/\s/g, ' ');

describe('DashboardPage', () => {
  it('shows what came in, went out, was left and is already committed next month', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<DashboardPage />, { finance, route: '/?mes=2026-10' });
    const stat = async (label: string | RegExp) =>
      plain((await screen.findByText(label)).closest('.stat')?.querySelector('.stat-value')?.textContent ?? null);
    expect(await stat('Entrou')).toBe('R$ 2.500,00');
    expect(await stat('Saiu')).toBe('R$ 1.800,00');
    expect(await stat('Sobrou')).toBe('R$ 700,00');
    expect(await stat(/Já comprometido em nov\/26/)).toBe('R$ 339,90');
    expect(finance.calls).toContain('report:2026-10');
  });

  it('links each highlight to the matching transactions', async () => {
    renderWithServices(<DashboardPage />, { route: '/?mes=2026-10' });
    const list = await screen.findByRole('list', { name: 'Destaques do mês' });
    const link = within(list).getByRole('link', { name: /Delivery \+40% vs média/ });
    expect(link).toHaveAttribute('href', '/transacoes?periodo=2026-10&categoria=alimentacao.delivery');
  });

  it('lists the top expenses and lets the user say something is not recurring', async () => {
    const { finance } = renderWithServices(<DashboardPage />, { route: '/?mes=2026-10' });
    expect(await screen.findByText('Aluguel Exemplo')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Streaming Exemplo não é recorrente' }));
    await waitFor(() => expect(finance.calls).toContain('dismiss:r-streaming'));
  });

  it('starts on the current month and never goes past it', async () => {
    const latest = currentMonth();
    const { finance } = renderWithServices(<DashboardPage />, { route: '/?mes=2999-01' });
    expect(await screen.findByRole('button', { name: 'Próximo mês' })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mês anterior' }));
    await waitFor(() => expect(finance.calls).toContain(`report:${addMonths(latest, -1)}`));
    expect(finance.calls[0]).toBe(`report:${latest}`);
  });

  it('offers to retry when the report fails', async () => {
    const finance = new FakeFinanceApi();
    finance.failReports = true;
    renderWithServices(<DashboardPage />, { finance });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    finance.failReports = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Entrou')).toBeInTheDocument();
  });

  it('explains what to do when there is no data yet', async () => {
    const finance = new FakeFinanceApi();
    finance.report = (month) => ({
      ...aReport(month),
      cashFlow: [
        {
          month,
          income: { cents: 0, currency: 'BRL' },
          spending: { cents: 0, currency: 'BRL' },
          net: { cents: 0, currency: 'BRL' },
        },
      ],
    });
    renderWithServices(<DashboardPage />, { finance });
    expect(await screen.findByRole('link', { name: 'Ir para Contas' })).toHaveAttribute('href', '/contas');
  });
});
