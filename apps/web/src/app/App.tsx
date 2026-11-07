import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppShell, Placeholder } from './AppShell';
import { useServices, useSession } from './services';

/** Sem sessão em memória, só existe a tela de entrada. A tela trava sozinha após inatividade. */
export function App() {
  const { session } = useServices();
  const state = useSession();

  useEffect(() => {
    const timer = setInterval(() => session.checkIdle(), 15_000);
    return () => clearInterval(timer);
  }, [session]);

  if (state.status === 'signed-out') return <LoginPage expired={state.reason === 'expired'} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Placeholder title="Painel" />} />
          <Route path="transacoes" element={<Placeholder title="Transações" />} />
          <Route path="parcelas" element={<Placeholder title="Parcelas" />} />
          <Route path="metas" element={<Placeholder title="Metas" />} />
          <Route path="renda" element={<Placeholder title="Renda" />} />
          <Route path="contas" element={<Placeholder title="Contas" />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Placeholder title="Página não encontrada" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
