import { z } from 'zod';

/**
 * Contratos da API do finapp (fonte única de verdade para API e web).
 * Dinheiro trafega em CENTAVOS inteiros; datas de calendário como AAAA-MM-DD.
 * Documentos (CPF/CNPJ) de contrapartes nunca são expostos.
 */

// ------------------------------------------------------------------ primitivos
export const MoneySchema = z.object({ cents: z.number().int(), currency: z.literal('BRL') });
export type MoneyDto = z.infer<typeof MoneySchema>;

export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD');

export const AccountKindSchema = z.enum(['checking', 'savings', 'credit_card', 'payment_account']);
export const PaymentMethodSchema = z.enum([
  'pix',
  'ted_doc',
  'boleto',
  'card_purchase',
  'bill_payment',
  'fee',
  'interest',
  'yield',
  'cashback',
  'refund',
  'other',
]);
export const ClassificationSchema = z.enum(['income', 'expense', 'internal_transfer', 'ignored']);
export const ClassificationSourceSchema = z.enum(['default', 'matcher', 'manual']);
export const CategorySourceSchema = z.enum(['provider', 'rule', 'learned', 'manual']);
export const CategoryKindSchema = z.enum(['expense', 'income', 'saving']);

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

// ------------------------------------------------------------------ contas
export const AccountSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  institutionName: z.string(),
  kind: AccountKindSchema,
  holderType: z.enum(['individual', 'business']),
  balance: MoneySchema,
  creditLimit: MoneySchema.optional(),
  lastSyncedAt: z.string().optional(),
});
export type AccountDto = z.infer<typeof AccountSchema>;

// ------------------------------------------------------------------ transações
export const TransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  occurredOn: LocalDateSchema,
  amount: MoneySchema,
  description: z.string(),
  paymentMethod: PaymentMethodSchema,
  status: z.enum(['pending', 'posted']),
  counterpartyName: z.string().optional(),
  installment: z
    .object({
      number: z.number().int(),
      total: z.number().int(),
      totalAmount: MoneySchema,
      totalAmountIsEstimated: z.boolean(),
    })
    .optional(),
  classification: ClassificationSchema,
  classificationSource: ClassificationSourceSchema,
  transferLinkId: z.string().optional(),
  category: z.object({ id: z.string(), source: CategorySourceSchema }).optional(),
});
export type TransactionDto = z.infer<typeof TransactionSchema>;

export const TransactionPageSchema = pageOf(TransactionSchema);
export type TransactionPageDto = z.infer<typeof TransactionPageSchema>;

/** Filtros de GET /transactions (vêm como texto na query string). */
export const TransactionListQuerySchema = z.object({
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  classification: ClassificationSchema.optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  /** Busca na descrição (sem acento, sem diferenciar maiúsculas). */
  q: z.string().trim().min(2).max(80).optional(),
  uncategorized: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TransactionListQuery = z.infer<typeof TransactionListQuerySchema>;

// ------------------------------------------------------------------ categorias e regras
export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: CategoryKindSchema,
  parentId: z.string().optional(),
  archived: z.boolean(),
});
export type CategoryDto = z.infer<typeof CategorySchema>;

export const RuleConditionsSchema = z.object({
  descriptionContains: z.string().trim().min(1).optional(),
  descriptionPattern: z.string().min(1).max(120).optional(),
  counterpartyNameContains: z.string().trim().min(1).optional(),
  accountId: z.string().min(1).optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  direction: z.enum(['inflow', 'outflow']).optional(),
  minAmountCents: z.number().int().min(0).optional(),
  maxAmountCents: z.number().int().min(0).optional(),
});

export const CategorizationRuleSchema = RuleConditionsSchema.extend({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  priority: z.number().int(),
  enabled: z.boolean(),
});
export type CategorizationRuleDto = z.infer<typeof CategorizationRuleSchema>;

// ------------------------------------------------------------------ parcelas
export const InstallmentPurchaseSchema = z.object({
  accountId: z.string(),
  merchant: z.string(),
  total: z.number().int(),
  knownNumbers: z.array(z.number().int()),
  remainingCount: z.number().int(),
  firstInstallmentMonth: z.string(),
  totalAmount: MoneySchema,
  totalAmountIsEstimated: z.boolean(),
  purchaseDate: LocalDateSchema.optional(),
  projected: z.array(z.object({ number: z.number().int(), expectedMonth: z.string(), amount: MoneySchema })),
});
export type InstallmentPurchaseDto = z.infer<typeof InstallmentPurchaseSchema>;

// ------------------------------------------------------------------ comandos (escrita)
export const CategorizeCommandSchema = z.object({ categoryId: z.string().min(1) });
export type CategorizeCommand = z.infer<typeof CategorizeCommandSchema>;

export const ClassifyCommandSchema = z.object({
  classification: ClassificationSchema,
  /** Para internal_transfer: a outra ponta (ligada nos dois sentidos). */
  counterpartId: z.string().min(1).optional(),
});
export type ClassifyCommand = z.infer<typeof ClassifyCommandSchema>;

export const CreateRuleCommandSchema = RuleConditionsSchema.extend({
  name: z.string().trim().min(1).max(80),
  categoryId: z.string().min(1),
  priority: z.number().int().min(0).max(10_000).default(100),
  enabled: z.boolean().default(true),
  /** Reaplica a categorização às transações dos últimos 12 meses (exceto manuais). */
  applyToExisting: z.boolean().default(true),
});
export type CreateRuleCommand = z.infer<typeof CreateRuleCommandSchema>;

/** Prévia de impacto de uma regra nova (ou de uma edição: `replacing` = id da regra editada). Não salva nada. */
export const RulePreviewCommandSchema = CreateRuleCommandSchema.omit({ applyToExisting: true }).extend({
  replacing: z.string().min(1).optional(),
});
export type RulePreviewCommand = z.input<typeof RulePreviewCommandSchema>;
export const RulePreviewSchema = z.object({
  affected: z.number().int(),
  examples: z.array(z.object({ description: z.string(), occurredOn: z.string(), from: z.string().nullable() })),
});
export type RulePreviewDto = z.infer<typeof RulePreviewSchema>;

/** PATCH de regra: campos ausentes não mudam; `null` remove uma condição. Reaplica aos últimos 12 meses. */
export const UpdateRuleCommandSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  categoryId: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
  enabled: z.boolean().optional(),
  descriptionContains: z.string().trim().min(1).nullable().optional(),
  descriptionPattern: z.string().min(1).max(120).nullable().optional(),
  counterpartyNameContains: z.string().trim().min(1).nullable().optional(),
  accountId: z.string().min(1).nullable().optional(),
  paymentMethod: PaymentMethodSchema.nullable().optional(),
  direction: z.enum(['inflow', 'outflow']).nullable().optional(),
  minAmountCents: z.number().int().min(0).nullable().optional(),
  maxAmountCents: z.number().int().min(0).nullable().optional(),
});
export type UpdateRuleCommand = z.infer<typeof UpdateRuleCommandSchema>;

export const CreateCategoryCommandSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: CategoryKindSchema,
  /** Para subcategoria, o id do grupo. */
  parentId: z.string().min(1).optional(),
});
export type CreateCategoryCommand = z.infer<typeof CreateCategoryCommandSchema>;

export const UpdateCategoryCommandSchema = z
  .object({ name: z.string().trim().min(1).max(60).optional(), archived: z.literal(true).optional() })
  .refine((v) => v.name !== undefined || v.archived !== undefined, 'informe name ou archived');
export type UpdateCategoryCommand = z.infer<typeof UpdateCategoryCommandSchema>;

// ------------------------------------------------------------------ sincronização
/** POST /sync. `full`: revisita 12 meses (aplica regras melhoradas aos meses antigos). Corpo opcional. */
export const SyncCommandSchema = z
  .object({ full: z.boolean().default(false) })
  .optional()
  .transform((v) => v ?? { full: false });
export type SyncCommand = z.input<typeof SyncCommandSchema>;

export const SyncRunSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  status: z.enum(['success', 'partial', 'failed']),
  accounts: z.array(
    z.object({
      accountExternalId: z.string(),
      created: z.number().int(),
      updated: z.number().int(),
      removed: z.number().int(),
      error: z.string().optional(),
    }),
  ),
  transferPairs: z.number().int(),
  ambiguousTransfers: z.number().int(),
  uncategorized: z.number().int(),
});
export type SyncRunDto = z.infer<typeof SyncRunSchema>;

/** Consentimento do Open Finance: avisa com 30 dias (aviso) e 7 dias (urgente). */
export const ConsentAlertSchema = z.enum(['ok', 'sem_data', 'aviso', 'urgente', 'erro', 'expirada']);
export const ConnectionsHealthSchema = z.object({
  checkedAt: z.iso.datetime().optional(),
  worst: ConsentAlertSchema,
  connections: z.array(
    z.object({
      id: z.string(),
      institutionName: z.string(),
      status: z.enum(['active', 'error', 'expired']),
      consentExpiresAt: z.iso.datetime().optional(),
      alert: ConsentAlertSchema,
      daysLeft: z.number().int().optional(),
    }),
  ),
});
export type ConnectionsHealthDto = z.infer<typeof ConnectionsHealthSchema>;

// ------------------------------------------------------------------ relatórios
export const RecurringSchema = z.object({
  key: z.string(),
  label: z.string(),
  occurrences: z.number().int(),
  typicalAmount: MoneySchema,
  intervalDays: z.number().int(),
  lastOn: LocalDateSchema,
  nextExpectedOn: LocalDateSchema,
  annualCost: MoneySchema,
  categoryId: z.string().optional(),
});
export type RecurringDto = z.infer<typeof RecurringSchema>;

const spentRow = { spent: MoneySchema, count: z.number().int() };

export const MonthlyReportSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  cashFlow: z.array(z.object({ month: z.string(), income: MoneySchema, spending: MoneySchema, net: MoneySchema })),
  categories: z.array(
    z.object({
      categoryId: z.string().nullable(),
      groupId: z.string().nullable(),
      ...spentRow,
      previousAverage: MoneySchema,
      changePercent: z.number().int().nullable(),
    }),
  ),
  byAccount: z.array(z.object({ accountId: z.string(), ...spentRow })),
  byPaymentMethod: z.array(z.object({ paymentMethod: PaymentMethodSchema, ...spentRow })),
  topExpenses: z.array(TransactionSchema),
  /** De onde veio o dinheiro: entradas reais do mês por fonte (sem transferências próprias e devoluções). */
  incomeSources: z.array(
    z.object({
      key: z.string(),
      /** Pessoa/empresa que pagou; ausente para rendimentos e cashback (use conta + categoria). */
      label: z.string().optional(),
      accountId: z.string().optional(),
      categoryId: z.string().optional(),
      total: MoneySchema,
      count: z.number().int(),
    }),
  ),
  outliers: z.array(z.object({ transaction: TransactionSchema, timesTheMedian: z.number() })),
  recurring: z.array(RecurringSchema),
  commitments: z.array(
    z.object({ month: z.string(), installments: MoneySchema, recurring: MoneySchema, total: MoneySchema }),
  ),
});
export type MonthlyReportDto = z.infer<typeof MonthlyReportSchema>;

export const MonthlyReportQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export type MonthlyReportQuery = z.infer<typeof MonthlyReportQuerySchema>;

// ------------------------------------------------------------------ autenticação
const PasswordSchema = z.string().min(8).max(128);

export const AuthStatusSchema = z.object({
  ownerExists: z.boolean(),
  passkeys: z.number().int(),
  /** Só no modo demonstração: a senha de acesso, para quem está experimentando. */
  demoPassword: z.string().optional(),
});
export type AuthStatusDto = z.infer<typeof AuthStatusSchema>;

export const LoginResultSchema = z.object({ token: z.string(), expiresAfterIdleMinutes: z.number().int() });
export type LoginResultDto = z.infer<typeof LoginResultSchema>;

export const SetupCommandSchema = z.object({ setupToken: z.string().min(10), password: PasswordSchema });
export type SetupCommand = z.infer<typeof SetupCommandSchema>;

export const PasswordLoginCommandSchema = z.object({ password: z.string().min(1).max(128) });
export type PasswordLoginCommand = z.infer<typeof PasswordLoginCommandSchema>;

/** Resposta do navegador (navigator.credentials), repassada como veio ao verificador WebAuthn. */
export const PasskeyLoginCommandSchema = z.object({ response: z.record(z.string(), z.unknown()) });
export type PasskeyLoginCommand = z.infer<typeof PasskeyLoginCommandSchema>;

export const PasskeyRegisterCommandSchema = z.object({
  response: z.record(z.string(), z.unknown()),
  label: z.string().trim().max(40).default('Digital'),
});
export type PasskeyRegisterCommand = z.infer<typeof PasskeyRegisterCommandSchema>;

export const ChangePasswordCommandSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: PasswordSchema,
});
export type ChangePasswordCommand = z.infer<typeof ChangePasswordCommandSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  method: z.enum(['password', 'passkey', 'setup']),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
});
export type SessionDto = z.infer<typeof SessionSchema>;

// ------------------------------------------------------------------ planejamento: renda
const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mês no formato AAAA-MM');
export const IncomeKindSchema = z.enum(['scholarship', 'freelance', 'employment', 'other']);
export const IncomeRiskSchema = z.enum(['low', 'medium', 'high']);
export const IncomeStatusSchema = z.enum(['active', 'pending', 'ended']);
const IncomeMatcherSchema = z.object({
  counterpartyContains: z.string().trim().max(80).optional(),
  descriptionContains: z.string().trim().max(80).optional(),
  accountId: z.string().min(1).optional(),
});

export const IncomeSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: IncomeKindSchema,
  expectedMonthly: MoneySchema,
  startsOn: YearMonthSchema,
  endsOn: YearMonthSchema.optional(),
  risk: IncomeRiskSchema,
  status: IncomeStatusSchema,
  matcher: IncomeMatcherSchema.optional(),
});
export type IncomeSourceDto = z.infer<typeof IncomeSourceSchema>;

export const CreateIncomeSourceCommandSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: IncomeKindSchema,
  expectedMonthlyCents: z.number().int().positive(),
  startsOn: YearMonthSchema,
  endsOn: YearMonthSchema.optional(),
  risk: IncomeRiskSchema,
  status: IncomeStatusSchema,
  matcher: IncomeMatcherSchema.optional(),
});
export type CreateIncomeSourceCommand = z.infer<typeof CreateIncomeSourceCommandSchema>;

/** Campos ausentes não mudam; `endsOn: null` remove o fim; `matcher: null` para de acompanhar. */
export const UpdateIncomeSourceCommandSchema = CreateIncomeSourceCommandSchema.partial().extend({
  endsOn: YearMonthSchema.nullable().optional(),
  matcher: IncomeMatcherSchema.nullable().optional(),
});
export type UpdateIncomeSourceCommand = z.infer<typeof UpdateIncomeSourceCommandSchema>;

export const IncomeOverviewQuerySchema = z.object({
  month: YearMonthSchema.optional(),
  months: z.coerce.number().int().min(1).max(60).default(24),
});

export const IncomeOverviewSchema = z.object({
  month: YearMonthSchema,
  projection: z.object({
    months: z.array(YearMonthSchema),
    scenarios: z.array(
      z.object({
        id: z.enum(['floor', 'likely', 'optimistic']),
        name: z.string(),
        description: z.string(),
        totals: z.array(MoneySchema),
        bySource: z.array(z.object({ sourceId: z.string(), amounts: z.array(MoneySchema) })),
      }),
    ),
  }),
  tracking: z.object({
    sources: z.array(
      z.object({
        sourceId: z.string(),
        expected: MoneySchema,
        observed: MoneySchema,
        status: z.enum(['paid', 'partial', 'missing', 'waiting', 'not_expected']),
      }),
    ),
    unrecognized: MoneySchema,
    suggestions: z.array(z.object({ name: z.string(), months: z.number().int(), averageMonthly: MoneySchema })),
  }),
});
export type IncomeOverviewDto = z.infer<typeof IncomeOverviewSchema>;

// ------------------------------------------------------------------ planejamento: metas
export const GoalKindSchema = z.enum(['purchase', 'lifestyle', 'reserve', 'debt']);
const installmentsSchema = z.number().int().min(1).max(480);
export const FinancingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cash') }),
  /** Tabela Price; taxa mensal decimal (0,0199 = 1,99% a.m.). */
  z.object({ kind: z.literal('loan'), installments: installmentsSchema, monthlyRate: z.number().min(0).max(0.2) }),
  z.object({ kind: z.literal('interest_free'), installments: installmentsSchema }),
  z.object({
    kind: z.literal('consortium'),
    installments: installmentsSchema,
    adminFeeRate: z.number().min(0).max(0.99),
  }),
]);
export type FinancingDto = z.infer<typeof FinancingSchema>;

export const GoalSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: GoalKindSchema,
  price: MoneySchema,
  downPayment: MoneySchema,
  oneTimeCosts: MoneySchema,
  financing: FinancingSchema,
  recurringCosts: z.array(
    z.object({ name: z.string(), monthly: MoneySchema, replacesCategoryId: z.string().optional() }),
  ),
  /** Calculados: quanto guardar para começar, parcela e custo total. */
  upfront: MoneySchema,
  installment: MoneySchema,
  totalCost: MoneySchema,
});
export type GoalDto = z.infer<typeof GoalSchema>;

export const GoalCommandSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: GoalKindSchema,
  priceCents: z.number().int().min(0),
  downPaymentCents: z.number().int().min(0).default(0),
  oneTimeCostsCents: z.number().int().min(0).default(0),
  financing: FinancingSchema,
  recurringCosts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        monthlyCents: z.number().int().min(0),
        replacesCategoryId: z.string().min(1).optional(),
      }),
    )
    .max(20)
    .default([]),
});
export type GoalCommand = z.input<typeof GoalCommandSchema>;

export const ReorderGoalsCommandSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(50) });

export const GoalPlanQuerySchema = z.object({
  months: z.coerce.number().int().min(6).max(120).default(48),
  /** Sem informar, usa o saldo disponível hoje nas contas (sem cartões). */
  startingSavingsCents: z.coerce.number().int().min(0).optional(),
  minSlackPercent: z.coerce.number().int().min(0).max(50).default(10),
});

const LeverSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('extra_income'), amount: MoneySchema }),
  z.object({ kind: z.literal('cut'), categoryId: z.string(), amount: MoneySchema }),
]);

export const GoalPlanSchema = z.object({
  months: z.array(YearMonthSchema),
  startingSavings: MoneySchema,
  minSlackPercent: z.number().int(),
  baseline: z.object({ monthlySpending: MoneySchema, months: z.number().int() }),
  scenarios: z.array(
    z.object({
      id: z.enum(['floor', 'likely', 'optimistic']),
      name: z.string(),
      goals: z.array(
        z.object({
          goalId: z.string(),
          status: z.enum(['scheduled', 'not_feasible', 'blocked']),
          startMonth: YearMonthSchema.optional(),
          monthsWaiting: z.number().int().optional(),
          monthlyCost: MoneySchema,
          monthlyCostAfterPayments: MoneySchema,
          alerts: z.array(z.enum(['income_drops', 'beyond_projection'])),
          monthlyGap: MoneySchema.optional(),
          levers: z.array(LeverSchema),
        }),
      ),
      timeline: z.array(
        z.object({
          month: YearMonthSchema,
          income: MoneySchema,
          spending: MoneySchema,
          surplus: MoneySchema,
          savings: MoneySchema,
        }),
      ),
    }),
  ),
});
export type GoalPlanDto = z.infer<typeof GoalPlanSchema>;

export const RequiredIncomeQuerySchema = z.object({
  months: z.coerce.number().int().min(6).max(120).default(60),
  /** Realizar cada meta até este mês. */
  deadline: YearMonthSchema.optional(),
  startingSavingsCents: z.coerce.number().int().min(0).optional(),
  minSlackPercent: z.coerce.number().int().min(0).max(50).default(10),
});

/** "Quanto preciso ganhar?": renda mensal estável mínima para cada meta da sequência (cumulativa). */
export const RequiredIncomeSchema = z.object({
  months: z.array(YearMonthSchema),
  deadline: YearMonthSchema.optional(),
  steps: z.array(
    z.object({ goalId: z.string(), monthlyIncome: MoneySchema.optional(), startMonth: YearMonthSchema.optional() }),
  ),
});
export type RequiredIncomeDto = z.infer<typeof RequiredIncomeSchema>;

// ------------------------------------------------------------------ carreira
const LanguageLevelSchema = z.enum(['basico', 'intermediario', 'avancado', 'fluente']);
const text = (max: number) => z.string().trim().max(max);
const period = { start: YearMonthSchema, end: YearMonthSchema.optional() };

export const CareerProfileSchema = z.object({
  headline: text(80).min(1),
  summary: text(2000),
  location: text(80),
  preferences: z.object({
    workModes: z.array(z.enum(['freela', 'pj', 'clt'])).max(3),
    remote: z.boolean(),
    inPerson: z.boolean(),
  }),
  english: z.object({
    reading: LanguageLevelSchema,
    listening: LanguageLevelSchema,
    writing: LanguageLevelSchema,
    speaking: LanguageLevelSchema,
  }),
  /** Horas por semana para trabalho extra; ausente = ainda não sabe. */
  hoursPerWeek: z.number().int().min(0).max(80).optional(),
  skills: z.array(z.object({ name: text(40).min(1), level: z.enum(['basico', 'intermediario', 'avancado']) })).max(60),
  experiences: z
    .array(z.object({ title: text(80).min(1), organization: text(80), description: text(1000), ...period }))
    .max(30),
  education: z.array(z.object({ title: text(120).min(1), institution: text(120), ...period })).max(10),
  links: z.array(z.object({ label: text(40).min(1), url: z.url() })).max(10),
  resumeMarkdown: z.string().max(20_000),
});
export type CareerProfileDto = z.infer<typeof CareerProfileSchema>;

export const OpportunityKindSchema = z.enum(['freela', 'recorrente', 'vaga', 'bolsa', 'outro']);
export const OpportunityStatusSchema = z.enum(['ideia', 'aplicada', 'conversa', 'fechada', 'perdida']);

export const OpportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: OpportunityKindSchema,
  status: OpportunityStatusSchema,
  estimatedMonthly: MoneySchema.optional(),
  estimatedOneOff: MoneySchema.optional(),
  link: z.string().optional(),
  notes: z.string(),
  updatedAt: z.string(),
});
export type OpportunityDto = z.infer<typeof OpportunitySchema>;

export const CreateOpportunityCommandSchema = z.object({
  title: text(120).min(1),
  kind: OpportunityKindSchema,
  status: OpportunityStatusSchema.default('ideia'),
  estimatedMonthlyCents: z.number().int().min(0).optional(),
  estimatedOneOffCents: z.number().int().min(0).optional(),
  link: z.url().optional(),
  notes: text(2000).default(''),
});
export type CreateOpportunityCommand = z.input<typeof CreateOpportunityCommandSchema>;

/** Campos ausentes não mudam; `null` limpa estimativas e link. */
export const UpdateOpportunityCommandSchema = z.object({
  title: text(120).min(1).optional(),
  kind: OpportunityKindSchema.optional(),
  status: OpportunityStatusSchema.optional(),
  estimatedMonthlyCents: z.number().int().min(0).nullable().optional(),
  estimatedOneOffCents: z.number().int().min(0).nullable().optional(),
  link: z.url().nullable().optional(),
  notes: text(2000).optional(),
});
export type UpdateOpportunityCommand = z.input<typeof UpdateOpportunityCommandSchema>;

// ---------------------------------------------------------------- rotina mensal (#28)
export const AnalysisOutcomeSchema = z.enum(['feita', 'pulada']);
/** Lembrete da análise mensal: o último mês fechado e se a análise dele já foi feita (ou pulada). */
export const AnalysisReminderSchema = z.object({
  month: YearMonthSchema,
  pending: z.boolean(),
  outcome: AnalysisOutcomeSchema.optional(),
  recordedAt: z.iso.datetime().optional(),
});
export type AnalysisReminderDto = z.infer<typeof AnalysisReminderSchema>;
export const RecordAnalysisCommandSchema = z.object({ outcome: AnalysisOutcomeSchema });
export type RecordAnalysisCommand = z.infer<typeof RecordAnalysisCommandSchema>;
