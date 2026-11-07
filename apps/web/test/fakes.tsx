import type { AuthStatusDto, LoginResultDto, SessionDto } from '@finapp/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { ServicesProvider } from '../src/app/services';
import { ApiError, type AuthApi } from '../src/lib/api/api-client';
import type { Biometrics } from '../src/lib/api/biometrics';
import { SessionStore } from '../src/lib/session/session-store';
import { FakeFinanceApi } from './finance-fixtures';

/** API de autenticação falsa (stub + spy), escrita à mão. */
export class FakeAuthApi implements AuthApi {
  readonly calls: string[] = [];
  statusValue: AuthStatusDto = { ownerExists: true, passkeys: 0 };
  correctPassword = 'senha-certa-1';
  validCode = 'codigo-valido';
  lockSeconds: number | undefined;
  sessionList: SessionDto[] = [];

  private ok(): LoginResultDto {
    return { token: 'token-de-teste', expiresAfterIdleMinutes: 10 };
  }
  async status() {
    this.calls.push('status');
    return this.statusValue;
  }
  async setup(code: string, password: string) {
    this.calls.push(`setup:${code}`);
    if (code !== this.validCode) throw new ApiError(401, 'não autorizado');
    this.correctPassword = password;
    return this.ok();
  }
  async login(password: string) {
    this.calls.push('login');
    if (this.lockSeconds) throw new ApiError(429, 'muitas tentativas', this.lockSeconds);
    if (password !== this.correctPassword) throw new ApiError(401, 'não autorizado');
    return this.ok();
  }
  async passkeyLoginOptions() {
    this.calls.push('passkey-options');
    return { challenge: 'c' };
  }
  async passkeyLogin() {
    this.calls.push('passkey-login');
    return this.ok();
  }
  async passkeyRegisterOptions() {
    this.calls.push('passkey-register-options');
    return { challenge: 'r' };
  }
  async passkeyRegister(_response: Record<string, unknown>, label: string) {
    this.calls.push(`passkey-register:${label}`);
    this.statusValue = { ...this.statusValue, passkeys: this.statusValue.passkeys + 1 };
  }
  async logout() {
    this.calls.push('logout');
  }
  async sessions() {
    return this.sessionList;
  }
  async revokeSession(id: string) {
    this.calls.push(`revoke:${id}`);
    this.sessionList = this.sessionList.filter((s) => s.id !== id);
  }
  async changePassword(current: string, next: string) {
    if (current !== this.correctPassword) throw new ApiError(401, 'não autorizado');
    this.correctPassword = next;
  }
}

/** Digital falsa: o teste decide se o aparelho suporta e se o usuário confirma. */
export class FakeBiometrics implements Biometrics {
  supported = true;
  approve = true;
  prompts = 0;
  isSupported() {
    return this.supported;
  }
  async authenticate() {
    this.prompts++;
    if (!this.approve) throw new Error('cancelado pelo usuário');
    return { id: 'cred' };
  }
  async register() {
    this.prompts++;
    if (!this.approve) throw new Error('cancelado pelo usuário');
    return { id: 'cred' };
  }
}

export function renderWithServices(
  ui: ReactElement,
  overrides: {
    auth?: FakeAuthApi;
    finance?: FakeFinanceApi;
    biometrics?: FakeBiometrics;
    session?: SessionStore;
    /** URL inicial do roteador em memória (telas que leem filtros da URL). */
    route?: string;
  } = {},
) {
  const auth = overrides.auth ?? new FakeAuthApi();
  const finance = overrides.finance ?? new FakeFinanceApi();
  const biometrics = overrides.biometrics ?? new FakeBiometrics();
  const session = overrides.session ?? new SessionStore();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={{ auth, finance, biometrics, session }}>
        <MemoryRouter initialEntries={[overrides.route ?? '/']}>{ui}</MemoryRouter>
      </ServicesProvider>
    </QueryClientProvider>,
  );
  return { ...view, auth, finance, biometrics, session };
}
