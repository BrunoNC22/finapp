import type {
  CreateCategoryCommand,
  CreateRuleCommand,
  RecordAnalysisCommand,
  RulePreviewCommand,
  UpdateCategoryCommand,
  UpdateRuleCommand,
} from '@finapp/contracts';
import {
  AccountSchema,
  AnalysisReminderSchema,
  type AuthStatusDto,
  AuthStatusSchema,
  type CareerProfileDto,
  CareerProfileSchema,
  CategorizationRuleSchema,
  CategorySchema,
  ConnectionsHealthSchema,
  type CreateIncomeSourceCommand,
  type CreateOpportunityCommand,
  type GoalCommand,
  GoalPlanSchema,
  GoalSchema,
  IncomeOverviewSchema,
  IncomeSourceSchema,
  InstallmentPurchaseSchema,
  type LoginResultDto,
  LoginResultSchema,
  MergeResultSchema,
  MonthlyReportSchema,
  OpportunitySchema,
  RequiredIncomeSchema,
  RulePreviewSchema,
  type SessionDto,
  SessionSchema,
  SyncRunSchema,
  type TransactionDto,
  TransactionPageSchema,
  TransactionSchema,
  type UpdateIncomeSourceCommand,
  type UpdateOpportunityCommand,
} from '@finapp/contracts';
import { type ZodType, z } from 'zod';
import type { SessionStore } from '../session/session-store';
import { type FinanceApi, type PlanQuery, searchToQueryString, type TransactionSearch } from './finance-api';

const RuleChangeSchema = z.object({ rule: CategorizationRuleSchema, affected: z.number().int() });
const AffectedSchema = z.object({ affected: z.number().int() });

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

/**
 * A resposta da API não bate com o contrato que este app conhece: a API já está numa versão mais
 * nova que o app aberto (PWA com código antigo). Recarregar resolve.
 */
export class OutdatedAppError extends Error {
  constructor() {
    super('o app está desatualizado em relação à API');
    this.name = 'OutdatedAppError';
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
  rules() {
    return this.request('GET', '/categorization-rules', CategorizationRuleSchema.array());
  }
  previewRule(command: RulePreviewCommand) {
    return this.request('POST', '/categorization-rules/preview', RulePreviewSchema, command);
  }
  createRule(command: CreateRuleCommand) {
    return this.request('POST', '/categorization-rules', RuleChangeSchema, command);
  }
  updateRule(id: string, command: UpdateRuleCommand) {
    return this.request('PATCH', `/categorization-rules/${encodeURIComponent(id)}`, RuleChangeSchema, command);
  }
  deleteRule(id: string) {
    return this.request('DELETE', `/categorization-rules/${encodeURIComponent(id)}`, AffectedSchema);
  }
  mergeCategory(id: string, into: string) {
    return this.request('POST', `/categories/${encodeURIComponent(id)}/merge`, MergeResultSchema, { into });
  }
  createCategory(command: CreateCategoryCommand) {
    return this.request('POST', '/categories', CategorySchema, command);
  }
  updateCategory(id: string, command: UpdateCategoryCommand) {
    return this.request('PATCH', `/categories/${encodeURIComponent(id)}`, CategorySchema, command);
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

  // ---------------------------------------------------------------- planejamento
  incomeSources() {
    return this.request('GET', '/income/sources', IncomeSourceSchema.array());
  }
  createIncomeSource(command: CreateIncomeSourceCommand) {
    return this.request('POST', '/income/sources', IncomeSourceSchema, command);
  }
  updateIncomeSource(id: string, command: UpdateIncomeSourceCommand) {
    return this.request('PATCH', `/income/sources/${encodeURIComponent(id)}`, IncomeSourceSchema, command);
  }
  async deleteIncomeSource(id: string) {
    await this.request('DELETE', `/income/sources/${encodeURIComponent(id)}`);
  }
  incomeOverview(month: string, months = 24) {
    return this.request(
      'GET',
      `/income/overview?month=${encodeURIComponent(month)}&months=${months}`,
      IncomeOverviewSchema,
    );
  }
  goals() {
    return this.request('GET', '/goals', GoalSchema.array());
  }
  createGoal(command: GoalCommand) {
    return this.request('POST', '/goals', GoalSchema, command);
  }
  replaceGoal(id: string, command: GoalCommand) {
    return this.request('PUT', `/goals/${encodeURIComponent(id)}`, GoalSchema, command);
  }
  async deleteGoal(id: string) {
    await this.request('DELETE', `/goals/${encodeURIComponent(id)}`);
  }
  async reorderGoals(ids: string[]) {
    await this.request('POST', '/goals/order', undefined, { ids });
  }
  goalPlan(query: PlanQuery) {
    return this.request('GET', `/goals/plan${planQueryString(query)}`, GoalPlanSchema);
  }
  requiredIncome(query: PlanQuery & { deadline?: string }) {
    return this.request('GET', `/goals/required-income${planQueryString(query)}`, RequiredIncomeSchema);
  }

  // ---------------------------------------------------------------- carreira
  async careerProfile() {
    try {
      return await this.request('GET', '/career/profile', CareerProfileSchema);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }
  saveCareerProfile(profile: CareerProfileDto) {
    return this.request('PUT', '/career/profile', CareerProfileSchema, profile);
  }
  opportunities() {
    return this.request('GET', '/career/opportunities', OpportunitySchema.array());
  }
  createOpportunity(command: CreateOpportunityCommand) {
    return this.request('POST', '/career/opportunities', OpportunitySchema, command);
  }
  updateOpportunity(id: string, command: UpdateOpportunityCommand) {
    return this.request('PATCH', `/career/opportunities/${encodeURIComponent(id)}`, OpportunitySchema, command);
  }
  async deleteOpportunity(id: string) {
    await this.request('DELETE', `/career/opportunities/${encodeURIComponent(id)}`);
  }
  connections() {
    return this.request('GET', '/connections', ConnectionsHealthSchema);
  }
  analysisReminder() {
    return this.request('GET', '/routine/analysis', AnalysisReminderSchema);
  }
  recordAnalysis(month: string, outcome: RecordAnalysisCommand['outcome']) {
    return this.request('POST', `/routine/analysis/${encodeURIComponent(month)}`, AnalysisReminderSchema, { outcome });
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
    if (!schema) return json as T;
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new OutdatedAppError();
    return parsed.data;
  }
}

function planQueryString(query: PlanQuery & { deadline?: string }): string {
  const params = new URLSearchParams();
  if (query.months !== undefined) params.set('months', String(query.months));
  if (query.startingSavingsCents !== undefined) params.set('startingSavingsCents', String(query.startingSavingsCents));
  if (query.minSlackPercent !== undefined) params.set('minSlackPercent', String(query.minSlackPercent));
  if (query.deadline) params.set('deadline', query.deadline);
  const text = params.toString();
  return text ? `?${text}` : '';
}
