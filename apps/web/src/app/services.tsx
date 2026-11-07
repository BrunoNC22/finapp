import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { AuthApi } from '../lib/api/api-client';
import type { Biometrics } from '../lib/api/biometrics';
import type { FinanceApi } from '../lib/api/finance-api';
import type { SessionState, SessionStore } from '../lib/session/session-store';

export interface Services {
  readonly auth: AuthApi;
  /** Dados financeiros (contas, transações, relatórios). */
  readonly finance: FinanceApi;
  readonly biometrics: Biometrics;
  readonly session: SessionStore;
}

const ServicesContext = createContext<Services | undefined>(undefined);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesProvider ausente');
  return services;
}

export function useSession(): SessionState {
  const { session } = useServices();
  return useSyncExternalStore(session.subscribe, session.getState);
}
