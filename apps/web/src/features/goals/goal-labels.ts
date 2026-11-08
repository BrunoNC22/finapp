import type { GoalDto, GoalPlanDto } from '@finapp/contracts';
import { formatCents, formatMonth } from '../../lib/format';

export const GOAL_KIND_LABEL: Record<GoalDto['kind'], string> = {
  purchase: 'Compra',
  lifestyle: 'Estilo de vida',
  reserve: 'Reserva',
  debt: 'Quitar dívida',
};

export const FINANCING_LABEL: Record<GoalDto['financing']['kind'], string> = {
  cash: 'À vista (juntar antes)',
  loan: 'Financiamento (com juros)',
  interest_free: 'Parcelado sem juros',
  consortium: 'Consórcio',
};

export type GoalOutcome = GoalPlanDto['scenarios'][number]['goals'][number];

/** "começa em dez/26", "não cabe", "espera a meta anterior". */
export function outcomeLabel(o: GoalOutcome | undefined): { text: string; tone: string } {
  if (!o) return { text: '—', tone: 'neutral' };
  if (o.status === 'scheduled' && o.startMonth) {
    return { text: o.monthsWaiting === 0 ? 'já cabe' : `em ${formatMonth(o.startMonth)}`, tone: 'income' };
  }
  if (o.status === 'blocked') return { text: 'espera a anterior', tone: 'neutral' };
  return { text: 'não cabe', tone: 'fee' };
}

export const ALERT_LABEL: Record<GoalOutcome['alerts'][number], string> = {
  income_drops: 'A renda cai durante as parcelas (fim de uma bolsa ou fonte).',
  beyond_projection: 'As parcelas vão além do período projetado.',
};

/** Efeito no orçamento: "+R$ 235/mês" ou "−R$ 10/mês". */
export const monthlyEffect = (cents: number): string =>
  cents === 0 ? 'não muda o gasto do mês' : `${cents > 0 ? '+' : '−'}${formatCents(Math.abs(cents))}/mês`;
