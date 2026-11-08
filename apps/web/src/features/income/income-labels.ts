import type { IncomeOverviewDto, IncomeSourceDto } from '@finapp/contracts';
import { formatMonth } from '../../lib/format';

export const KIND_LABEL: Record<IncomeSourceDto['kind'], string> = {
  scholarship: 'Bolsa',
  freelance: 'Freela / serviços',
  employment: 'Emprego',
  other: 'Outra',
};

export const RISK_LABEL: Record<IncomeSourceDto['risk'], string> = {
  low: 'Risco baixo',
  medium: 'Risco médio',
  high: 'Risco alto',
};

export const STATUS_LABEL: Record<IncomeSourceDto['status'], string> = {
  active: 'Pagando',
  pending: 'Pendente',
  ended: 'Encerrada',
};

type TrackingStatus = IncomeOverviewDto['tracking']['sources'][number]['status'];
export const TRACKING_LABEL: Record<TrackingStatus, { label: string; tone: string }> = {
  paid: { label: 'Pagou', tone: 'income' },
  partial: { label: 'Pagou menos', tone: 'fee' },
  missing: { label: 'Não pagou', tone: 'fee' },
  waiting: { label: 'Aguardando', tone: 'neutral' },
  not_expected: { label: 'Fora do período', tone: 'neutral' },
};

/** "jan/25 – dez/27" ou "desde jan/25". */
export const periodLabel = (s: Pick<IncomeSourceDto, 'startsOn' | 'endsOn'>): string =>
  s.endsOn
    ? `${formatMonth(s.startsOn)} – ${formatMonth(s.endsOn)}`
    : `desde ${formatMonth(s.startsOn)}, sem fim definido`;
