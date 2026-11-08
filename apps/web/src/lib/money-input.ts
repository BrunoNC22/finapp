/**
 * Valor digitado em reais → centavos inteiros. Aceita "1.234,56", "1234,56", "1234.56", "1234" e "R$ 50".
 * Devolve undefined para o que não é um valor.
 */
export function parseReais(text: string): number | undefined {
  const cleaned = text.replace(/R\$|\s/g, '');
  if (!cleaned) return undefined;
  let normalized = cleaned;
  if (cleaned.includes(',')) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  return Math.round(Number(normalized) * 100);
}

/** Centavos → texto editável ("1234,56"), sem símbolo. */
export const centsToInput = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

/** "1,99" ou "1.99" (por cento) → 0,0199. */
export function parsePercent(text: string): number | undefined {
  const normalized = text.replace('%', '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return undefined;
  return Number(normalized) / 100;
}
