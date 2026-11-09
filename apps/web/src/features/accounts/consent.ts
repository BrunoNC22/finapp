import type { ConnectionsHealthDto } from '@finapp/contracts';

type Connection = ConnectionsHealthDto['connections'][number];

/** Onde renovar a autorização (Meu Pluggy, usado pela instância). */
export const RENEW_URL = 'https://meu.pluggy.ai';

/** Precisa de atenção: avisa com 30 dias, insiste com 7, e quando expirou ou quebrou. */
export const needsAttention = (alert: Connection['alert']) =>
  alert === 'aviso' || alert === 'urgente' || alert === 'expirada' || alert === 'erro';

const days = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

export function consentText(c: Connection): string {
  switch (c.alert) {
    case 'expirada':
      return 'Autorização expirada: a sincronização desta instituição parou.';
    case 'erro':
      return 'A conexão está com erro no provedor.';
    case 'sem_data':
      return 'O provedor não informou até quando vale a autorização.';
    default:
      return `Autorização válida por mais ${days(c.daysLeft ?? 0)}.`;
  }
}

/** Frase do aviso no Painel para a conexão mais urgente. */
export function bannerText(health: ConnectionsHealthDto): string | undefined {
  const order: Connection['alert'][] = ['expirada', 'erro', 'urgente', 'aviso'];
  const worst = [...health.connections]
    .filter((c) => needsAttention(c.alert))
    .sort((a, b) => order.indexOf(a.alert) - order.indexOf(b.alert) || (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
  if (!worst) return undefined;
  const others = health.connections.filter((c) => needsAttention(c.alert)).length - 1;
  const more = others > 0 ? ` (e mais ${others})` : '';
  if (worst.alert === 'expirada') return `A autorização de ${worst.institutionName}${more} expirou.`;
  if (worst.alert === 'erro') return `A conexão com ${worst.institutionName}${more} está com erro.`;
  return `A autorização de ${worst.institutionName}${more} expira em ${days(worst.daysLeft ?? 0)}.`;
}
