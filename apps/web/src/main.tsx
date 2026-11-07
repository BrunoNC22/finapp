import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ServicesProvider } from './app/services';
import { ApiClient } from './lib/api/api-client';
import { browserBiometrics } from './lib/api/biometrics';
import { SessionStore } from './lib/session/session-store';
import './styles/tokens.css';
import './styles/global.css';

const session = new SessionStore();
const api = new ApiClient(session);
// Dados financeiros não ficam em cache por muito tempo, nem são refeitos ao trocar de aba.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});
// Ao sair ou expirar a sessão, nada de dados antigos fica na memória do app.
session.subscribe(() => {
  if (session.getState().status === 'signed-out') queryClient.clear();
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ServicesProvider services={{ auth: api, finance: api, biometrics: browserBiometrics, session }}>
          <App />
        </ServicesProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
