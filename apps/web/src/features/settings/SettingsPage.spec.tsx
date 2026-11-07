import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeAuthApi, renderWithServices } from '../../../test/fakes';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('registers the fingerprint of this device', async () => {
    const { auth } = renderWithServices(<SettingsPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cadastrar digital neste aparelho' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Digital cadastrada');
    expect(auth.calls).toContain('passkey-register:Este aparelho');
  });

  it('lists open sessions and ends another one', async () => {
    const auth = new FakeAuthApi();
    auth.sessionList = [
      {
        id: 'a',
        method: 'password',
        createdAt: '2026-11-07T10:00:00.000Z',
        lastSeenAt: '2026-11-07T10:05:00.000Z',
        current: true,
      },
      {
        id: 'b',
        method: 'passkey',
        createdAt: '2026-11-06T10:00:00.000Z',
        lastSeenAt: '2026-11-06T10:05:00.000Z',
        current: false,
      },
    ];
    renderWithServices(<SettingsPage />, { auth });
    expect(await screen.findByText(/Entrou por digital/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(auth.calls).toContain('revoke:b'));
  });

  it('changes the password', async () => {
    const { auth } = renderWithServices(<SettingsPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Senha atual'), 'senha-certa-1');
    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-22');
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Senha alterada');
    expect(auth.correctPassword).toBe('senha-nova-22');
  });

  it('logs out', async () => {
    const { auth } = renderWithServices(<SettingsPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sair' }));
    expect(auth.calls).toContain('logout');
  });
});
