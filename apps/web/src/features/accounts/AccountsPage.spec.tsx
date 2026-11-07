import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { FakeFinanceApi } from '../../../test/finance-fixtures';
import { AccountsPage } from './AccountsPage';

const plain = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

describe('AccountsPage', () => {
  it('shows balances and how much of the card limit is used', async () => {
    renderWithServices(<AccountsPage />);
    expect(await screen.findByText('Banco Exemplo · Conta corrente')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uso do limite de Banco Exemplo · Cartão' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
    expect(plain(screen.getByText(/de R\$.*disponível/).textContent)).toBe(
      '25% de R$ 3.000,00 · disponível R$ 2.250,00',
    );
  });

  it('syncs on demand and lists past runs', async () => {
    const { finance } = renderWithServices(<AccountsPage />);
    expect(await screen.findByText('Concluída')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sincronizar agora' }));
    expect(await screen.findByText('Sincronização concluída.')).toHaveAttribute('role', 'status');
    expect(finance.calls).toContain('sync');
  });

  it('explains when a sync is already running', async () => {
    const finance = new FakeFinanceApi();
    finance.syncBusy = true;
    renderWithServices(<AccountsPage />, { finance });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sincronizar agora' }));
    expect(await screen.findByText(/Já existe uma sincronização em andamento/)).toHaveAttribute('role', 'status');
  });
});
