import type { TransactionDto } from '@finapp/contracts';
import type { TransactionSearch } from '../../lib/api/finance-api';
import { isMonth, type Month, monthBounds } from '../../lib/months';

/** Filtros da tela de transações. Vivem na URL (dá para voltar, recarregar e compartilhar o link). */
export interface TransactionFilters {
  /** Mês (AAAA-MM) ou 'all' para todos os meses. */
  readonly period: Month | 'all';
  readonly accountId?: string;
  /** Id de categoria, ou 'none' para "sem categoria". */
  readonly categoryId?: string;
  readonly classification?: TransactionDto['classification'];
  readonly paymentMethod?: TransactionDto['paymentMethod'];
  readonly q?: string;
}

const CLASSIFICATIONS = ['income', 'expense', 'internal_transfer', 'ignored'] as const;
const METHODS = [
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
] as const;

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | undefined =>
  value !== null && (values as readonly string[]).includes(value) ? (value as T) : undefined;

const nonEmpty = (value: string | null): string | undefined => (value?.trim() ? value.trim() : undefined);

export function filtersFromParams(params: URLSearchParams, defaultPeriod: Month): TransactionFilters {
  const period = params.get('periodo');
  const accountId = nonEmpty(params.get('conta'));
  const categoryId = nonEmpty(params.get('categoria'));
  const classification = oneOf(CLASSIFICATIONS, params.get('tipo'));
  const paymentMethod = oneOf(METHODS, params.get('forma'));
  const q = nonEmpty(params.get('busca'));
  return {
    period: period === 'all' || isMonth(period) ? period : defaultPeriod,
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(classification ? { classification } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(q ? { q } : {}),
  };
}

export function filtersToParams(filters: TransactionFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set('periodo', filters.period);
  if (filters.accountId) params.set('conta', filters.accountId);
  if (filters.categoryId) params.set('categoria', filters.categoryId);
  if (filters.classification) params.set('tipo', filters.classification);
  if (filters.paymentMethod) params.set('forma', filters.paymentMethod);
  if (filters.q) params.set('busca', filters.q);
  return params;
}

/** Converte os filtros da tela na busca da API. A busca por texto só vale a partir de 2 letras. */
export function toSearch(filters: TransactionFilters): TransactionSearch {
  const q = filters.q?.trim();
  return {
    ...(filters.period !== 'all' ? monthBounds(filters.period) : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.categoryId === 'none'
      ? { uncategorized: true }
      : filters.categoryId
        ? { categoryId: filters.categoryId }
        : {}),
    ...(filters.classification ? { classification: filters.classification } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(q && q.length >= 2 ? { q: q.slice(0, 80) } : {}),
  };
}
