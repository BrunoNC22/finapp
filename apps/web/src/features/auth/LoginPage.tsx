import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useServices } from '../../app/services';
import { ApiError } from '../../lib/api/api-client';

type Mode = 'login' | 'setup' | 'reset';

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    const minutes = Math.ceil((error.retryAfterSeconds ?? 900) / 60);
    return `Muitas tentativas. Tente de novo em ${minutes} min.`;
  }
  if (error instanceof ApiError && error.status === 401) return 'Não foi possível entrar. Confira e tente de novo.';
  if (error instanceof ApiError && error.status === 400) return 'Confira os dados informados.';
  return 'Não foi possível conectar. Tente de novo.';
}

/**
 * Tela de entrada no estilo app de banco: pede a senha ou a digital toda vez que o app é aberto.
 * No primeiro acesso (ou "esqueci a senha") pede o código gerado no servidor.
 */
export function LoginPage({ expired = false }: { expired?: boolean }) {
  const { auth, biometrics, session } = useServices();
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => auth.status() });
  const [mode, setMode] = useState<Mode>('login');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const autoPrompted = useRef(false);

  const firstAccess = status.data?.ownerExists === false;
  const effectiveMode: Mode = firstAccess ? 'setup' : mode;
  const canUseFingerprint = !!status.data?.passkeys && biometrics.isSupported() && effectiveMode === 'login';

  const run = async (action: () => Promise<{ token: string; expiresAfterIdleMinutes: number }>) => {
    setBusy(true);
    setError(undefined);
    try {
      const { token, expiresAfterIdleMinutes } = await action();
      session.signIn(token, expiresAfterIdleMinutes);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
      setPassword('');
      setConfirmation('');
    }
  };

  const withFingerprint = () =>
    run(async () => auth.passkeyLogin(await biometrics.authenticate(await auth.passkeyLoginOptions())));

  // Como app de banco: com digital cadastrada, já pede a digital ao abrir (uma vez).
  useEffect(() => {
    if (canUseFingerprint && !autoPrompted.current && !expired) {
      autoPrompted.current = true;
      void withFingerprint();
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (effectiveMode === 'login') return void run(() => auth.login(password));
    if (password !== confirmation) return setError('As senhas não conferem.');
    return void run(() => auth.setup(code.trim(), password));
  };

  if (status.isPending) return <main className="auth-screen" aria-busy="true" />;
  if (status.isError)
    return (
      <main className="auth-screen">
        <p role="alert">Não foi possível conectar ao finapp.</p>
      </main>
    );

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit} aria-labelledby="auth-title">
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1 id="auth-title">
          {effectiveMode === 'login'
            ? 'Entrar no finapp'
            : effectiveMode === 'setup'
              ? 'Primeiro acesso'
              : 'Redefinir senha'}
        </h1>
        {expired && effectiveMode === 'login' && <p className="hint">Sua sessão foi encerrada por segurança.</p>}

        {status.data?.demoPassword && effectiveMode === 'login' && (
          <section className="notice demo-note" role="note" aria-label="Modo demonstração">
            <p>
              <strong>Modo demonstração</strong>: dados fictícios, gerados na hora. Senha:{' '}
              <code>{status.data.demoPassword}</code>
            </p>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => {
                const demoPassword = status.data?.demoPassword ?? '';
                void run(() => auth.login(demoPassword));
              }}
            >
              Entrar na demonstração
            </button>
          </section>
        )}

        {effectiveMode !== 'login' && (
          <>
            <p className="hint">
              Gere o código no servidor com <code>docker compose exec api node dist/cli.js setup-token</code>. Ele vale
              15 minutos e uma única vez.
            </p>
            <label>
              Código de acesso
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required />
            </label>
          </>
        )}

        <label>
          {effectiveMode === 'login' ? 'Senha' : 'Nova senha'}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={effectiveMode === 'login' ? 'current-password' : 'new-password'}
            minLength={effectiveMode === 'login' ? 1 : 8}
            required
          />
        </label>
        {effectiveMode !== 'login' && (
          <label>
            Confirme a senha
            <input
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
        )}

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <button type="submit" className="primary" disabled={busy}>
          {effectiveMode === 'login' ? 'Entrar' : 'Salvar senha e entrar'}
        </button>
        {canUseFingerprint && (
          <button type="button" onClick={() => void withFingerprint()} disabled={busy}>
            Entrar com digital
          </button>
        )}
        {!firstAccess && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(effectiveMode === 'login' ? 'reset' : 'login');
              setError(undefined);
            }}
          >
            {effectiveMode === 'login' ? 'Esqueci a senha' : 'Voltar para a entrada'}
          </button>
        )}
      </form>
    </main>
  );
}
