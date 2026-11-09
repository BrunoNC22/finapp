import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { FakeFinanceApi } from '../../../test/finance-fixtures';
import { DashboardPage } from './DashboardPage';

describe('monthly analysis reminder on the dashboard', () => {
  it('asks for the analysis of the last closed month and disappears once it is done', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<DashboardPage />, { finance, route: '/?mes=2026-10' });
    const reminder = await screen.findByRole('complementary', { name: 'Análise do mês' });
    expect(reminder).toHaveTextContent('A análise de outubro de 2026 ainda não foi feita.');
    expect(reminder).toHaveTextContent('/analise-financeira');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Já fiz' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Análise do mês' })).toBeNull());
    expect(finance.calls).toContain('record-analysis:2026-10:feita');
  });

  it('can skip a month, and stays hidden when the month was already handled', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<DashboardPage />, { finance, route: '/?mes=2026-10' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Pular este mês' }));
    await waitFor(() => expect(finance.calls).toContain('record-analysis:2026-10:pulada'));

    const done = new FakeFinanceApi();
    done.reminder = { month: '2026-10', pending: false, outcome: 'feita', recordedAt: '2026-11-02T12:00:00.000Z' };
    renderWithServices(<DashboardPage />, { finance: done, route: '/?mes=2026-10' });
    await screen.findAllByRole('heading', { name: 'Painel' });
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Análise do mês' })).toBeNull());
  });
});
