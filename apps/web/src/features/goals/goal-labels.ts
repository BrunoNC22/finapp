import type { GoalDto, GoalPlanDto } from '@finapp/contracts';
import { formatCents, formatMonth, formatRate } from '../../lib/format';

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

export const ASSET_CATEGORY_LABEL: Record<NonNullable<GoalDto['category']>['kind'], string> = {
  vehicle: 'Veículo/locomoção',
  electronics: 'Informática/eletrônicos',
  home: 'Casa/móveis/eletrodomésticos',
  other: 'Outro',
};

export const categoryLabel = (category: GoalDto['category']): string | undefined =>
  category ? (category.label ?? ASSET_CATEGORY_LABEL[category.kind]) : undefined;

export type GoalOutcome = GoalPlanDto['scenarios'][number]['goals'][number];

/** Nome do bem vendido: o nome da meta dona dele, ou o nome do bem que a pessoa já tem. */
export const tradeInName = (source: GoalDto['tradeIns'][number]['source'], goals: readonly GoalDto[]): string =>
  source.kind === 'owned' ? source.name : (goals.find((g) => g.id === source.goalId)?.name ?? 'meta excluída');

/** "Bicicleta elétrica (perde 20% ao ano) e Capacete (R$ 300,00 hoje, não desvaloriza)". */
export function tradeInsSummary(goal: GoalDto, goals: readonly GoalDto[]): string {
  const parts = goal.tradeIns.map((t) => {
    const rate =
      t.annualDepreciationRate > 0 ? `perde ${formatRate(t.annualDepreciationRate)} ao ano` : 'não desvaloriza';
    return t.source.kind === 'owned'
      ? `${t.source.name} (${formatCents(t.source.currentValue.cents)} hoje, ${rate})`
      : `${tradeInName(t.source, goals)} (${rate})`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : (parts[0] ?? '');
}

/**
 * Metas cujo bem pode ser vendido pela meta na posição `position` (a nova vai para o fim): de compra, antes na
 * fila e que nenhuma outra meta já vende. Mesma regra da API.
 */
export function sellableGoals(goals: readonly GoalDto[], editing?: GoalDto): GoalDto[] {
  const position = editing ? goals.findIndex((g) => g.id === editing.id) : goals.length;
  const soldElsewhere = new Set(
    goals
      .filter((g) => g.id !== editing?.id)
      .flatMap((g) => g.tradeIns.flatMap((t) => (t.source.kind === 'goal' ? [t.source.goalId] : []))),
  );
  return goals.slice(0, Math.max(0, position)).filter((g) => g.kind === 'purchase' && !soldElsewhere.has(g.id));
}

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
