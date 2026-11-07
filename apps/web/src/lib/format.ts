/** Formatação centralizada: nenhuma tela formata dinheiro ou data por conta própria. */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

/** Centavos inteiros → "R$ 1.234,56". */
export const formatCents = (cents: number): string => brl.format(cents / 100);

/** Centavos inteiros → "R$ 1,2 mil" (eixos de gráfico, cartões pequenos). */
export const formatCentsCompact = (cents: number): string => brlCompact.format(cents / 100);

/** 40 → "+40%". */
export const formatPercent = (value: number): string => percent.format(value / 100);

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-10-05" → "05/10/2026". Sem fuso: é uma data de calendário. */
export const formatDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
};

/** "2026-10" → "out/26". */
export const formatMonth = (month: string): string => {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1] ?? m}/${y?.slice(2)}`;
};

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** Instante ISO → "07/11/2026, 06:00" (horário de Brasília). */
export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
