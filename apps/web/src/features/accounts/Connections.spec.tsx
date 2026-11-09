import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { FakeFinanceApi } from '../../../test/finance-fixtures';
import { DashboardPage } from '../dashboard/DashboardPage';
import { AccountsPage } from './AccountsPage';

describe('Open Finance consent', () => {
  it('lists each connection with how long its authorization lasts and how to renew it', async () => {
    renderWithServices(<AccountsPage />, { route: '/contas' });
    const list = await screen.findByRole('list', { name: 'Conexões' });
    const item = within(list).getByText('Banco Aurora').closest('li') as HTMLElement;
    expect(item).toHaveTextContent('Autorização válida por mais 364 dias. Vence em 08/11/2027.');
    expect(item).toHaveTextContent('Em dia');
    expect(screen.getAllByRole('link', { name: 'Meu Pluggy' })[0]).toHaveAttribute('href', 'https://meu.pluggy.ai');
  });

  it('warns on the dashboard when an authorization is about to expire, and stays quiet otherwise', async () => {
    const finance = new FakeFinanceApi();
    finance.connectionsHealth = {
      worst: 'urgente',
      connections: [{ id: 'c1', institutionName: 'Carteira Ágil', status: 'active', alert: 'urgente', daysLeft: 5 }],
    };
    renderWithServices(<DashboardPage />, { finance, route: '/?mes=2026-10' });
    const banner = await screen.findByRole('complementary', { name: 'Open Finance' });
    expect(banner).toHaveTextContent('A autorização de Carteira Ágil expira em 5 dias.');
    expect(within(banner).getByRole('link', { name: 'Ver conexões' })).toHaveAttribute('href', '/contas');

    renderWithServices(<DashboardPage />, { route: '/?mes=2026-10' });
    await screen.findAllByRole('heading', { name: 'Painel' });
    expect(screen.getAllByRole('complementary', { name: 'Open Finance' })).toHaveLength(1);
  });
});
