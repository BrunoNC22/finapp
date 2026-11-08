import { lazy, Suspense, useEffect } from 'react';
import { LoginPage } from '../features/auth/LoginPage';
import { LoadingScreen } from './LoadingScreen';
import { useServices, useSession } from './services';

// Divisão de código: a tela de entrada precisa abrir rápido, mesmo num celular lento.
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));
const ChartsPreview = lazy(() =>
  import('../features/dev/ChartsPreview').then((module) => ({ default: module.ChartsPreview })),
);

/** Sem sessão em memória, só existe a tela de entrada. A tela trava sozinha após inatividade. */
export function App() {
  const { session } = useServices();
  const state = useSession();

  useEffect(() => {
    const timer = setInterval(() => session.checkIdle(), 15_000);
    return () => clearInterval(timer);
  }, [session]);

  // Só em desenvolvimento: revisão visual dos gráficos (dados fictícios), sem login.
  if (import.meta.env.DEV && window.location.pathname === '/dev/charts') {
    return (
      <Suspense fallback={null}>
        <ChartsPreview />
      </Suspense>
    );
  }
  if (state.status === 'signed-out') return <LoginPage expired={state.reason === 'expired'} />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthenticatedApp />
    </Suspense>
  );
}
