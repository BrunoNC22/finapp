import type { InstallmentPurchaseDto } from '@finapp/contracts';

export interface InstallmentProgress {
  /** Parcelas já vistas nas faturas (a maior conhecida). */
  readonly paid: number;
  /** Valor de cada parcela, positivo. */
  readonly installmentCents: number;
  /** Soma das parcelas que ainda vão cair, positivo. */
  readonly remainingCents: number;
  /** Mês (AAAA-MM) da última parcela prevista. */
  readonly lastMonth?: string;
}

export function installmentProgress(p: InstallmentPurchaseDto): InstallmentProgress {
  const paid = Math.max(0, p.total - p.remainingCount);
  const remainingCents = p.projected.reduce((sum, i) => sum + Math.abs(i.amount.cents), 0);
  const installmentCents = Math.abs(p.projected[0]?.amount.cents ?? Math.round(p.totalAmount.cents / p.total));
  const lastMonth = p.projected.at(-1)?.expectedMonth;
  return { paid, installmentCents, remainingCents, ...(lastMonth ? { lastMonth } : {}) };
}

export interface InstallmentSummary {
  readonly remainingCents: number;
  readonly remainingInstallments: number;
  /** Último mês com parcela prevista entre todas as compras. */
  readonly lastMonth?: string;
}

export function summarizeInstallments(purchases: readonly InstallmentPurchaseDto[]): InstallmentSummary {
  let remainingCents = 0;
  let remainingInstallments = 0;
  let lastMonth: string | undefined;
  for (const p of purchases) {
    const progress = installmentProgress(p);
    remainingCents += progress.remainingCents;
    remainingInstallments += p.remainingCount;
    if (progress.lastMonth && (!lastMonth || progress.lastMonth > lastMonth)) lastMonth = progress.lastMonth;
  }
  return { remainingCents, remainingInstallments, ...(lastMonth ? { lastMonth } : {}) };
}
