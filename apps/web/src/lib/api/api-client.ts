import {
  AccountSchema,
  type AuthStatusDto,
  AuthStatusSchema,
  CategorySchema,
  InstallmentPurchaseSchema,
  type LoginResultDto,
  LoginResultSchema,
  MonthlyReportSchema,
  type SessionDto,
  SessionSchema,
  SyncRunSchema,
  type TransactionDto,
  TransactionPageSchema,
  TransactionSchema,
} from '@finapp/contracts';
import type { ZodType } from 'zod';
import type { SessionStore } from '../session/session-store';
import { type FinanceApi, searchToQueryString, type TransactionSearch } from './finance-api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Porta usada pelas telas de entrada e configurações (o teste usa um dublê manual). */
export interface AuthApi {
  status(): Promise<AuthStatusDto>;
  setup(setupToken: string, password: string): Promise<LoginResultDto>;
  login(password: string): Promise<LoginResultDto>;
  passkeyLoginOptions(): Promise<unknown>;
  passkeyLogin(response: Record<string, unknown>): Promise<LoginResultDto>;
  passkeyRegisterOptions(): Promise<unknown>;
  passkeyRegister(response: Record<string, unknown>, label: string): Promise<void>;
  logout(): Promise<void>;
  sessions(): Promise<SessionDto[]>;
  revokeSession(id: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Cliente HTTP da API. Envia o token da sessão em memória, valida as respostas com os contratos
 * e, num 401 com sessão, encerra a sessão (o app volta para a tela de entrada).
 */
export class ApiClient implements AuthApi, FinanceApi {
  constructor(
    private readonly session: SessionStore,
    private readonly baseUrl = '/api',
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
  ) {}

  status() {
    return this.request('GET', '/auth/status', AuthStatusSchema);
  }
  setup(setupToken: string, password: string) {
    return this.request('POST', '/auth/setup', LoginResultSchema, { setupToken, password });
  }
  login(password: string) {
    return this.request('POST', '/auth/login', LoginResultSchema, { password });
  }
  passkeyLoginOptions() {
    return this.request('POST', '/auth/passkey/login/options');
  }
  passkeyLogin(response: Record<string, unknown>) {
    return this.request('POST', '/auth/passkey/login', LoginResultSchema, { response });
  }
  passkeyRegisterOptions() {
    return this.request('POST', '/auth/passkey/register/options');
  }
  async passkeyRegister(response: Record<string, unknown>, label: string) {
    await this.request('POST', '/auth/passkey/register', undefined, { response, label });
  }
  async logout() {
    await this.request('POST', '/auth/logout');
    this.session.signOut();
  }
  sessions() {
    return this.request('GET', '/auth/sessions', SessionSchema.array());
  }
  async revokeSession(id: string) {
    await this.request('DELETE', `/auth/sessions/${encodeURIComponent(id)}`);
  }
  async changePassword(currentPassword: string, newPassword: string) {
    await this.request('POST', '/auth/password', undefined, { currentPassword, newPassword });
  }

  // ---------------------------------------------------------------- dados (FinanceApi)
  accounts() {
    return this.request('GET', '/accounts', AccountSchema.array());
  }
  categories() {
    return this.request('GET', '/categories', CategorySchema.array());
  }
  monthlyReport(month: string) {
    return this.request('GET', `/reports/monthly?month=${encodeURIComponent(month)}`, MonthlyReportSchema);
  }
  transactions(search: TransactionSearch) {
    return this.request('GET', `/transactions${searchToQueryString(search)}`, TransactionPageSchema);
  }
  categorize(transactionId: string, categoryId: string) {
    return this.request('PATCH', `/transactions/${encodeURIComponent(transactionId)}/category`, TransactionSchema, {
      categoryId,
    });
  }
  classify(transactionId: string, classification: TransactionDto['classification']) {
    return this.request(
      'PATCH',
      `/transactions/${encodeURIComponent(transactionId)}/classification`,
      TransactionSchema,
      { classification },
    );
  }
  installments() {
    return this.request('GET', '/installments', InstallmentPurchaseSchema.array());
  }
  syncNow(options: { full?: boolean } = {}) {
    return this.request('POST', '/sync', SyncRunSchema, options.full ? { full: true } : undefined);
  }
  syncRuns(limit: number) {
    return this.request('GET', `/sync/runs?limit=${limit}`, SyncRunSchema.array());
  }
  async dismissRecurring(key: string) {
    await this.request('POST', `/reports/recurring/${encodeURIComponent(key)}/dismiss`);
  }

  /** Requisição genérica. */
  async request<T = unknown>(method: string, path: string, schema?: ZodType<T>, body?: unknown): Promise<T> {
    const token = this.session.currentToken();
    const response = await this.fetchFn(this.baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401 && token) this.session.expire();
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string; retryAfterSeconds?: number };
      throw new ApiError(response.status, payload.message ?? `erro ${response.status}`, payload.retryAfterSeconds);
    }
    if (token) this.session.touch();
    if (response.status === 204) return undefined as T;
    const json: unknown = await response.json();
    return schema ? schema.parse(json) : (json as T);
  }
}
