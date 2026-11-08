import { BrowserRouter, Route, Routes } from 'react-router';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { GoalsPage } from '../features/goals/GoalsPage';
import { IncomePage } from '../features/income/IncomePage';
import { InstallmentsPage } from '../features/installments/InstallmentsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { AppShell, Placeholder } from './AppShell';

/** Área logada. Carregada sob demanda: a tela de entrada não baixa o código das telas nem dos gráficos. */
export default function AuthenticatedApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="transacoes" element={<TransactionsPage />} />
          <Route path="parcelas" element={<InstallmentsPage />} />
          <Route path="metas" element={<GoalsPage />} />
          <Route path="renda" element={<IncomePage />} />
          <Route path="contas" element={<AccountsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Placeholder title="Página não encontrada" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
