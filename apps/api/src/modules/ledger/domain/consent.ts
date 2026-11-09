/**
 * Consentimento do Open Finance: a autorização de leitura dura até ~12 meses e precisa ser renovada no provedor.
 * O app avisa com 30 dias e insiste com 7.
 */
export type ConsentAlert = 'ok' | 'sem_data' | 'aviso' | 'urgente' | 'erro' | 'expirada';

export const WARN_DAYS = 30;
export const URGENT_DAYS = 7;
const DAY_MS = 86_400_000;

/** Do menos ao mais grave. */
const SEVERITY: readonly ConsentAlert[] = ['ok', 'sem_data', 'aviso', 'urgente', 'erro', 'expirada'];

export function consentAlert(
  connection: { readonly status: 'active' | 'error' | 'expired'; readonly consentExpiresAt?: Date | undefined },
  now: Date,
): { readonly alert: ConsentAlert; readonly daysLeft?: number } {
  const daysLeft = connection.consentExpiresAt
    ? Math.ceil((connection.consentExpiresAt.getTime() - now.getTime()) / DAY_MS)
    : undefined;
  const withDays = (alert: ConsentAlert) => (daysLeft === undefined ? { alert } : { alert, daysLeft });
  if (connection.status === 'expired' || (daysLeft !== undefined && daysLeft <= 0)) return withDays('expirada');
  if (connection.status === 'error') return withDays('erro');
  if (daysLeft === undefined) return { alert: 'sem_data' };
  if (daysLeft <= URGENT_DAYS) return withDays('urgente');
  if (daysLeft <= WARN_DAYS) return withDays('aviso');
  return withDays('ok');
}

export function worstAlert(alerts: readonly ConsentAlert[]): ConsentAlert {
  return alerts.reduce<ConsentAlert>((worst, a) => (SEVERITY.indexOf(a) > SEVERITY.indexOf(worst) ? a : worst), 'ok');
}
