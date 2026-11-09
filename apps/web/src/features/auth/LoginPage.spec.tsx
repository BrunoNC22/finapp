import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeAuthApi, FakeBiometrics, renderWithServices } from '../../../test/fakes';
import { LoginPage } from './LoginPage';

const user = () => userEvent.setup();

describe('LoginPage (bank-app style)', () => {
  it('demo mode: shows the demo password and enters with one tap', async () => {
    const auth = new FakeAuthApi();
    auth.statusValue = { ownerExists: true, passkeys: 0, demoPassword: 'senha-do-demo' };
    auth.correctPassword = 'senha-do-demo';
    const { session } = renderWithServices(<LoginPage />, { auth });

    const note = await screen.findByRole('note', { name: 'Modo demonstração' });
    expect(note).toHaveTextContent('dados fictícios');
    expect(note).toHaveTextContent('senha-do-demo');
    await user().click(screen.getByRole('button', { name: 'Entrar na demonstração' }));
    await waitFor(() => expect(session.getState().status).toBe('signed-in'));
    expect(auth.calls).toContain('login');
  });

  it('a real instance never shows a demo note', async () => {
    renderWithServices(<LoginPage />);
    expect(await screen.findByRole('heading', { name: 'Entrar no finapp' })).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'Modo demonstração' })).toBeNull();
  });

  it('first access: asks the server code and a new password, then signs in', async () => {
    const auth = new FakeAuthApi();
    auth.statusValue = { ownerExists: false, passkeys: 0 };
    const { session } = renderWithServices(<LoginPage />, { auth });

    expect(await screen.findByRole('heading', { name: 'Primeiro acesso' })).toBeInTheDocument();
    await user().type(screen.getByLabelText('Código de acesso'), 'codigo-valido');
    await user().type(screen.getByLabelText('Nova senha'), 'minha-senha-1');
    await user().type(screen.getByLabelText('Confirme a senha'), 'minha-senha-1');
    await user().click(screen.getByRole('button', { name: 'Salvar senha e entrar' }));

    await waitFor(() => expect(session.getState().status).toBe('signed-in'));
    expect(auth.calls).toContain('setup:codigo-valido');
  });

  it('first access: refuses different passwords before calling the server', async () => {
    const auth = new FakeAuthApi();
    auth.statusValue = { ownerExists: false, passkeys: 0 };
    renderWithServices(<LoginPage />, { auth });

    await user().type(await screen.findByLabelText('Código de acesso'), 'codigo-valido');
    await user().type(screen.getByLabelText('Nova senha'), 'minha-senha-1');
    await user().type(screen.getByLabelText('Confirme a senha'), 'outra-senha-2');
    await user().click(screen.getByRole('button', { name: 'Salvar senha e entrar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('As senhas não conferem.');
    expect(auth.calls.some((c) => c.startsWith('setup'))).toBe(false);
  });

  it('signs in with the password; a wrong one shows a generic message and clears the field', async () => {
    const { session } = renderWithServices(<LoginPage />);
    const field = await screen.findByLabelText('Senha');

    await user().type(field, 'errada-errada');
    await user().click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar');
    expect(field).toHaveValue('');

    await user().type(field, 'senha-certa-1');
    await user().click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(session.getState().status).toBe('signed-in'));
  });

  it('tells how long to wait when the login is locked', async () => {
    const auth = new FakeAuthApi();
    auth.lockSeconds = 900;
    renderWithServices(<LoginPage />, { auth });
    await user().type(await screen.findByLabelText('Senha'), 'qualquer');
    await user().click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tente de novo em 15 min');
  });

  it('with a fingerprint registered, asks for it right away when the app opens', async () => {
    const auth = new FakeAuthApi();
    auth.statusValue = { ownerExists: true, passkeys: 1 };
    const { session, biometrics } = renderWithServices(<LoginPage />, { auth });

    await waitFor(() => expect(session.getState().status).toBe('signed-in'));
    expect(biometrics.prompts).toBe(1);
    expect(auth.calls).toEqual(expect.arrayContaining(['passkey-options', 'passkey-login']));
  });

  it('if the fingerprint is cancelled, the password and the fingerprint button stay available', async () => {
    const auth = new FakeAuthApi();
    auth.statusValue = { ownerExists: true, passkeys: 1 };
    const biometrics = new FakeBiometrics();
    biometrics.approve = false;
    renderWithServices(<LoginPage />, { auth, biometrics });

    expect(await screen.findByRole('button', { name: 'Entrar com digital' })).toBeEnabled();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('no fingerprint button when the device does not support it or none is registered', async () => {
    const biometrics = new FakeBiometrics();
    biometrics.supported = false;
    const auth = new FakeAuthApi();
    auth.statusValue = { ownerExists: true, passkeys: 1 };
    renderWithServices(<LoginPage />, { auth, biometrics });
    await screen.findByLabelText('Senha');
    expect(screen.queryByRole('button', { name: 'Entrar com digital' })).not.toBeInTheDocument();
  });

  it('after the session expires, explains why and does not prompt automatically', async () => {
    const auth = new FakeAuthApi();
    auth.statusValue = { ownerExists: true, passkeys: 1 };
    const { biometrics } = renderWithServices(<LoginPage expired />, { auth });
    expect(await screen.findByText('Sua sessão foi encerrada por segurança.')).toBeInTheDocument();
    expect(biometrics.prompts).toBe(0);
  });

  it('"forgot my password" switches to the reset form with the server code', async () => {
    renderWithServices(<LoginPage />);
    await user().click(await screen.findByRole('button', { name: 'Esqueci a senha' }));
    expect(screen.getByRole('heading', { name: 'Redefinir senha' })).toBeInTheDocument();
    expect(screen.getByLabelText('Código de acesso')).toBeInTheDocument();
  });
});
