import type { FinancingDto } from '@finapp/contracts';

export interface GoalCostInput {
  readonly priceCents: number;
  readonly downPaymentCents: number;
  readonly oneTimeCostsCents: number;
  readonly financing: FinancingDto;
}

export interface GoalCost {
  readonly upfrontCents: number;
  readonly installmentCents: number;
  readonly installments: number;
  readonly totalCents: number;
}

/**
 * Simulação instantânea no formulário, com a MESMA regra da API (Goal no domínio): à vista paga tudo na largada;
 * Tabela Price no financiamento; sem juros divide; consórcio soma a taxa de administração.
 */
export function goalCost({ priceCents, downPaymentCents, oneTimeCostsCents, financing }: GoalCostInput): GoalCost {
  if (financing.kind === 'cash') {
    const upfront = priceCents + oneTimeCostsCents;
    return { upfrontCents: upfront, installmentCents: 0, installments: 0, totalCents: upfront };
  }
  const principal = Math.max(0, priceCents - downPaymentCents);
  const n = financing.installments;
  let installment: number;
  if (financing.kind === 'interest_free') installment = Math.round(principal / n);
  else if (financing.kind === 'consortium') installment = Math.round((principal * (1 + financing.adminFeeRate)) / n);
  else {
    const i = financing.monthlyRate;
    installment = Math.round(i === 0 ? principal / n : (principal * i) / (1 - (1 + i) ** -n));
  }
  const upfront = downPaymentCents + oneTimeCostsCents;
  return {
    upfrontCents: upfront,
    installmentCents: installment,
    installments: n,
    totalCents: upfront + installment * n,
  };
}
