import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { FakeFinanceApi, INSTALLMENTS } from '../../../test/finance-fixtures';
import { InstallmentsPage } from './InstallmentsPage';

const plain = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

describe('InstallmentsPage', () => {
  it('shows each purchase with paid installments, what is left and when it ends', async () => {
    renderWithServices(<InstallmentsPage />);
    expect(await screen.findByText('Loja Exemplo')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Loja Exemplo: 4 de 10 parcelas pagas' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    expect(plain(screen.getByText(/pagas · faltam/).textContent)).toBe('4/10 pagas · faltam R$ 1.800,00');
    expect(plain(screen.getByText(/termina em/).textContent)).toMatch(/termina em abr\/27/);
    expect(screen.getByText('Livre de parcelas em')).toBeInTheDocument();
  });

  it('hides finished purchases and says when there is nothing left', async () => {
    const finance = new FakeFinanceApi();
    finance.installmentList = INSTALLMENTS.map((p) => ({ ...p, remainingCount: 0, projected: [] }));
    renderWithServices(<InstallmentsPage />, { finance });
    expect(await screen.findByText('Nenhuma compra parcelada em andamento.')).toBeInTheDocument();
  });
});
