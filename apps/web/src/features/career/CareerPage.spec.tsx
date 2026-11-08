import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithServices } from '../../../test/fakes';
import { FakeFinanceApi } from '../../../test/finance-fixtures';
import { CareerPage } from './CareerPage';

describe('CareerPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the opportunities in their columns with the monthly potential', async () => {
    renderWithServices(<CareerPage />, { route: '/carreira' });
    const ideas = await screen.findByRole('region', { name: 'Ideia' });
    expect(within(ideas).getByText('Agente de IA no WhatsApp')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Aplicada / proposta enviada' })).getByText('Vaga PJ remota'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Em aberto: até R\$\s7\.300,00\/mês/)).toBeInTheDocument();
  });

  it('moves an opportunity forward and deletes after confirming', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<CareerPage />, { finance, route: '/carreira' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Avançar Agente de IA no WhatsApp' }));
    await waitFor(() => expect(finance.calls).toContain('update-opportunity:o1'));
    expect(finance.sent.at(-1)).toEqual({ status: 'aplicada' });
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Aplicada / proposta enviada' })).getByText(
          'Agente de IA no WhatsApp',
        ),
      ).toBeInTheDocument(),
    );

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const card = screen.getByText('Vaga PJ remota').closest('.board-card') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(finance.calls).toContain('delete-opportunity:o2'));
  });

  it('creates an opportunity with amounts in cents', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<CareerPage />, { finance, route: '/carreira' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nova oportunidade' }));
    const form = screen.getByRole('form', { name: 'Nova oportunidade' });
    await user.type(within(form).getByLabelText('Título'), 'Site para clínica');
    await user.type(within(form).getByLabelText('De uma vez (R$)'), '1.500,00');
    await user.type(within(form).getByLabelText('Link'), 'ftp://x');
    await user.click(within(form).getByRole('button', { name: 'Adicionar' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('https://');
    await user.clear(within(form).getByLabelText('Link'));
    await user.click(within(form).getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(finance.calls).toContain('create-opportunity'));
    expect(finance.sent.at(-1)).toEqual({
      title: 'Site para clínica',
      kind: 'freela',
      notes: '',
      estimatedOneOffCents: 150000,
    });
  });

  it('saves the profile with parsed skills, cleared end dates and optional hours', async () => {
    const finance = new FakeFinanceApi();
    renderWithServices(<CareerPage />, { finance, route: '/carreira' });
    const user = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'Perfil profissional' });
    expect(within(form).getByLabelText('Título')).toHaveValue('Desenvolvedora Full Stack');
    const skills = within(form).getByLabelText(/^Skills/);
    await user.clear(skills);
    await user.type(skills, 'React: avançado{enter}Docker');
    await user.clear(within(form).getByLabelText('Fim'));
    await user.selectOptions(within(form).getByLabelText('Fala'), 'avancado');
    await user.click(within(form).getByRole('button', { name: 'Salvar perfil' }));

    await waitFor(() => expect(finance.calls).toContain('save-profile'));
    const saved = finance.sent.at(-1) as Record<string, unknown>;
    expect(saved.skills).toEqual([
      { name: 'React', level: 'avancado' },
      { name: 'Docker', level: 'intermediario' },
    ]);
    expect(saved.experiences).toEqual([
      { title: 'Desenvolvedora', organization: 'Empresa A', start: '2025-01', description: 'Sistemas web' },
    ]);
    expect(saved).not.toHaveProperty('hoursPerWeek');
    expect((saved.english as Record<string, string>).speaking).toBe('avancado');
    expect(await screen.findByRole('status')).toHaveTextContent('Perfil salvo.');
  });

  it('starts with an empty form when there is no profile yet and requires a headline', async () => {
    const finance = new FakeFinanceApi();
    finance.profile = null;
    renderWithServices(<CareerPage />, { finance, route: '/carreira' });
    const user = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'Perfil profissional' });
    await user.type(within(form).getByLabelText(/^Horas por semana/), '200');
    await user.click(within(form).getByRole('button', { name: 'Salvar perfil' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('título');
    await user.type(within(form).getByLabelText('Título'), 'Dev');
    await user.click(within(form).getByRole('button', { name: 'Salvar perfil' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('0 a 80');
    expect(finance.calls).not.toContain('save-profile');
  });
});
