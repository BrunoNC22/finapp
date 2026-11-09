import type { CategorizationRuleDto, TransactionDto } from '@finapp/contracts';
import { formatCents } from '../../lib/format';

/** Descrições que não dizem nada sozinhas: nelas, a contraparte é que identifica o lançamento. */
const GENERIC = /^(pix (enviado|recebido)|transfer[eê]ncia|ted|doc|pagamento|compra|d[eé]bito)\b/i;

export type ConditionKind = 'descriptionContains' | 'counterpartyNameContains';

/** Condição sugerida para "criar regra para parecidas": um trecho estável da descrição, ou a contraparte. */
export function suggestCondition(t: TransactionDto): { kind: ConditionKind; value: string } {
  const counterparty = t.counterpartyName?.trim();
  if (counterparty && GENERIC.test(t.description.trim()))
    return { kind: 'counterpartyNameContains', value: counterparty.toLowerCase() };
  const words = t.description
    .toLowerCase()
    .replace(/[*#]/g, ' ')
    .split(/\s+/)
    // Números, datas e códigos mudam a cada lançamento: ficam de fora.
    .filter((w) => w && !/\d/.test(w));
  return { kind: 'descriptionContains', value: words.slice(0, 3).join(' ') || t.description.toLowerCase() };
}

/** Resumo legível das condições de uma regra. */
export function ruleSummary(rule: CategorizationRuleDto): string {
  const parts: string[] = [];
  if (rule.descriptionContains) parts.push(`descrição contém “${rule.descriptionContains}”`);
  if (rule.descriptionPattern) parts.push(`descrição segue /${rule.descriptionPattern}/`);
  if (rule.counterpartyNameContains) parts.push(`contraparte contém “${rule.counterpartyNameContains}”`);
  if (rule.paymentMethod) parts.push(`forma: ${rule.paymentMethod}`);
  if (rule.direction) parts.push(rule.direction === 'inflow' ? 'entradas' : 'saídas');
  if (rule.minAmountCents !== undefined) parts.push(`a partir de ${formatCents(rule.minAmountCents)}`);
  if (rule.maxAmountCents !== undefined) parts.push(`até ${formatCents(rule.maxAmountCents)}`);
  if (rule.accountId) parts.push('numa conta específica');
  return parts.join(' · ') || 'sem condições';
}

export const isDefaultRule = (rule: CategorizationRuleDto) => rule.id.startsWith('default-rule-');
