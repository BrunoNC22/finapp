import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useServices } from '../../app/services';
import { formatDate } from '../../lib/format';
import { type ThemePreference, theme } from '../../lib/theme';

const METHOD: Record<string, string> = { password: 'senha', passkey: 'digital', setup: 'primeiro acesso' };

/** Segurança: digital (passkey), sessões abertas, troca de senha e saída. */
export function SettingsPage() {
  const { auth, biometrics } = useServices();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => auth.status() });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => auth.sessions() });
  const [message, setMessage] = useState<string | undefined>();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const registerFingerprint = useMutation({
    mutationFn: async () =>
      auth.passkeyRegister(await biometrics.register(await auth.passkeyRegisterOptions()), 'Este aparelho'),
    onSuccess: () => {
      setMessage('Digital cadastrada. Na próxima vez, entre com ela.');
      void queryClient.invalidateQueries({ queryKey: ['auth-status'] });
    },
    onError: () => setMessage('Não foi possível cadastrar a digital neste aparelho.'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => auth.revokeSession(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const changePassword = useMutation({
    mutationFn: () => auth.changePassword(current, next),
    onSuccess: () => {
      setMessage('Senha alterada. As outras sessões foram encerradas.');
      setCurrent('');
      setNext('');
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: () => setMessage('Não foi possível alterar a senha. Confira a senha atual.'),
  });

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    changePassword.mutate();
  };

  return (
    <section className="page" aria-labelledby="settings-title">
      <h1 id="settings-title">Configurações</h1>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}

      <article className="card">
        <h2>Digital</h2>
        <p className="hint">
          {status.data?.passkeys ? `${status.data.passkeys} digital(is) cadastrada(s).` : 'Nenhuma digital cadastrada.'}{' '}
          Com a digital, você entra sem digitar a senha.
        </p>
        {biometrics.isSupported() ? (
          <button
            type="button"
            className="primary"
            onClick={() => registerFingerprint.mutate()}
            disabled={registerFingerprint.isPending}
          >
            Cadastrar digital neste aparelho
          </button>
        ) : (
          <p className="hint">Este aparelho/navegador não oferece digital.</p>
        )}
      </article>

      <article className="card">
        <h2>Aparência</h2>
        <label>
          Tema
          <select defaultValue={theme.get()} onChange={(e) => theme.set(e.target.value as ThemePreference)}>
            <option value="system">Igual ao sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </label>
      </article>

      <article className="card">
        <h2>Sessões abertas</h2>
        <ul className="list">
          {sessions.data?.map((s) => (
            <li key={s.id}>
              <span>
                Entrou por {METHOD[s.method] ?? s.method} em {formatDate(s.createdAt.slice(0, 10))}
                {s.current && <strong> (esta)</strong>}
              </span>
              {!s.current && (
                <button type="button" onClick={() => revoke.mutate(s.id)}>
                  Encerrar
                </button>
              )}
            </li>
          ))}
        </ul>
      </article>

      <article className="card">
        <h2>Trocar senha</h2>
        <form onSubmit={submitPassword} className="stack">
          <label>
            Senha atual
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            Nova senha
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button type="submit" disabled={changePassword.isPending}>
            Trocar senha
          </button>
        </form>
      </article>

      <button type="button" className="danger" onClick={() => void auth.logout()}>
        Sair
      </button>
    </section>
  );
}
