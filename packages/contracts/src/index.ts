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
export const CategorySourceSchema = z.enum(['provider', 'rule', 'manual']);
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
  descriptionPattern: z.string().min(1).optional(),
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
