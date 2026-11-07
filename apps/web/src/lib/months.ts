/**
 * Meses de calendário no formato AAAA-MM. Sem Date nas contas: só aritmética de ano/mês,
 * para nunca escorregar de mês por causa de fuso.
 */
export type Month = string;

const LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const parse = (month: Month): { year: number; index: number } => {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`mês inválido: ${month}`);
  return { year: Number(match[1]), index: Number(match[2]) - 1 };
};

const format = (year: number, index: number): Month => `${year}-${String(index + 1).padStart(2, '0')}`;

export const isMonth = (value: string | null | undefined): value is Month =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** Mês corrente no fuso informado (padrão: o do Brasil, como na API). */
export function currentMonth(now: Date = new Date(), timeZone = 'America/Sao_Paulo'): Month {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${year}-${month}`;
}

export function addMonths(month: Month, delta: number): Month {
  const { year, index } = parse(month);
  const total = year * 12 + index + delta;
  return format(Math.floor(total / 12), ((total % 12) + 12) % 12);
}

/** Primeiro e último dia do mês, como AAAA-MM-DD. */
export function monthBounds(month: Month): { from: string; to: string } {
  const { year, index } = parse(month);
  const lastDay = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** "2026-10" → "outubro de 2026". */
export function formatMonthLong(month: Month): string {
  const { year, index } = parse(month);
  return `${LONG[index]} de ${year}`;
}
