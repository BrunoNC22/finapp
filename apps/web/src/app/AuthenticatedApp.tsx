import { BrowserRouter, Route, Routes } from 'react-router';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppShell, Placeholder } from './AppShell';

/** Área logada. Carregada sob demanda: a tela de entrada não baixa o código das telas nem dos gráficos. */
export default function AuthenticatedApp() {
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
