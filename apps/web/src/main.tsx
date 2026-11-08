import { registerSW } from 'virtual:pwa-register';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ServicesProvider } from './app/services';
import { ApiClient } from './lib/api/api-client';
import { browserBiometrics } from './lib/api/biometrics';
import { watchForUpdates } from './lib/pwa/update-checks';
import { SessionStore } from './lib/session/session-store';
import './styles/tokens.css';
import './styles/global.css';

// Service worker: atualiza sozinho e procura versão nova ao voltar para o app.
registerSW({ immediate: true, onRegisteredSW: (_url, registration) => registration && watchForUpdates(registration) });

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
