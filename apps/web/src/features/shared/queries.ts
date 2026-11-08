import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useServices } from '../../app/services';
import { accountLabel } from '../../lib/accounts';
import { CategoryDirectory } from '../../lib/categories';

/** Chaves do cache de dados. Após sincronizar ou editar, invalidar `finance` refaz tudo. */
export const financeKeys = {
  all: ['finance'] as const,
  accounts: ['finance', 'accounts'] as const,
  categories: ['finance', 'categories'] as const,
  report: (month: string) => ['finance', 'report', month] as const,
  transactions: (search: object) => ['finance', 'transactions', search] as const,
  installments: ['finance', 'installments'] as const,
  syncRuns: ['finance', 'sync-runs'] as const,
  incomeSources: ['finance', 'income-sources'] as const,
  incomeOverview: (month: string) => ['finance', 'income-overview', month] as const,
  goals: ['finance', 'goals'] as const,
  goalPlan: ['finance', 'goal-plan'] as const,
  requiredIncome: (deadline: string) => ['finance', 'required-income', deadline] as const,
  careerProfile: ['finance', 'career-profile'] as const,
  opportunities: ['finance', 'opportunities'] as const,
};

export function useCategories(): CategoryDirectory {
  const { finance } = useServices();
  const query = useQuery({
    queryKey: financeKeys.categories,
    queryFn: () => finance.categories(),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => (query.data ? new CategoryDirectory(query.data) : CategoryDirectory.empty()), [query.data]);
}

export function useAccounts() {
  const { finance } = useServices();
  return useQuery({ queryKey: financeKeys.accounts, queryFn: () => finance.accounts() });
}

/** id da conta → "Instituição · Nome". */
export function useAccountNames(): (accountId: string) => string {
  const accounts = useAccounts();
  return useMemo(() => {
    const names = new Map(accounts.data?.map((a) => [a.id, accountLabel(a)]));
    return (accountId: string) => names.get(accountId) ?? 'Conta';
  }, [accounts.data]);
}
