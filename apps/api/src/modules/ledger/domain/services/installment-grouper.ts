import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import type { Installment } from '../installment.js';
import type { Transaction } from '../transaction.js';

/** Normaliza a descrição do estabelecimento para agrupar parcelas da mesma compra. */
export function normalizeMerchant(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\*\S*/g, ' ') // sufixos do adquirente: "LOJA*123"
    .replace(/\bparc(ela)?\.?\s*\d+\s*\/\s*\d+/g, ' ') // "PARC 02/06"
    .replace(/\b\d+\s*\/\s*\d+\b/g, ' ') // "02/06"
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ProjectedInstallment {
  readonly number: number;
  /** AAAA-MM em que a parcela deve cair. */
  readonly expectedMonth: string;
  /** Valor positivo comprometido. */
  readonly amount: Money;
}

export interface MonthlyCommitment {
  readonly month: string;
  readonly amount: Money;
}

interface KnownInstallment {
  readonly transaction: Transaction;
  readonly installment: Installment;
}

/** Compra parcelada reconstruída a partir das parcelas que já apareceram. */
export class InstallmentPurchase {
  private readonly known: KnownInstallment[] = [];

  constructor(
    readonly accountId: string,
    readonly merchant: string,
    readonly total: number,
    /** Mês (AAAA-MM) da 1ª parcela. */
    readonly firstInstallmentMonth: string,
  ) {}

  /** Uso interno do agrupador. */
  add(known: KnownInstallment): void {
    this.known.push(known);
    this.known.sort((a, b) => a.installment.number - b.installment.number);
  }

  /**
   * As parcelas de uma compra podem diferir em alguns centavos (resto da divisão vai para uma delas).
   * Tolerância: até `total` centavos, o maior resto possível.
   */
  hasInstallmentValueCloseTo(cents: number): boolean {
    return this.known.some((k) => Math.abs(k.transaction.amount.abs().cents - cents) <= this.total);
  }

  has(number: number): boolean {
    return this.known.some((k) => k.installment.number === number);
  }

  get transactionIds(): string[] {
    return this.known.map((k) => k.transaction.id);
  }

  get knownNumbers(): number[] {
    return this.known.map((k) => k.installment.number);
  }

  private get latest(): KnownInstallment {
    return this.known.at(-1) as KnownInstallment;
  }

  get remainingCount(): number {
    return this.total - this.latest.installment.number;
  }

  get purchaseDate(): LocalDate | undefined {
    return this.known.find((k) => k.installment.purchaseDate)?.installment.purchaseDate;
  }

  get totalAmount(): Money {
    return (this.known.find((k) => !k.installment.totalAmountIsEstimated) ?? this.latest).installment.totalAmount;
  }

  get totalAmountIsEstimated(): boolean {
    return this.known.every((k) => k.installment.totalAmountIsEstimated);
  }

  /** Parcelas ainda não lançadas, uma por mês depois da última conhecida. */
  projectRemaining(): ProjectedInstallment[] {
    const { transaction, installment } = this.latest;
    const exactParts = this.totalAmountIsEstimated ? undefined : this.totalAmount.allocate(this.total);
    const projected: ProjectedInstallment[] = [];
    for (let number = installment.number + 1; number <= this.total; number++) {
      projected.push({
        number,
        expectedMonth: transaction.occurredOn.addMonths(number - installment.number).monthKey,
        amount: exactParts?.[number - 1] ?? transaction.amount.abs(),
      });
    }
    return projected;
  }
}

/**
 * Reagrupa parcelas soltas em compras parceladas e projeta os compromissos futuros.
 * O Open Finance não fornece um id que ligue as parcelas de uma compra: o agrupamento usa
 * cartão + estabelecimento normalizado + nº de parcelas, e dentro disso valor da parcela (tolerância
 * de centavos: o resto da divisão vai para uma parcela) e mês da 1ª parcela (tolerância de 1 mês,
 * porque o fechamento da fatura desloca o lançamento).
 */
export class InstallmentGrouper {
  group(transactions: readonly Transaction[]): InstallmentPurchase[] {
    const byKey = new Map<string, { known: KnownInstallment; anchor: LocalDate }[]>();
    for (const transaction of transactions) {
      const installment = transaction.installment;
      if (!installment) continue;
      const key = [transaction.accountId, normalizeMerchant(transaction.description), installment.total].join('|');
      const anchor = installment.purchaseDate ?? transaction.occurredOn.addMonths(-(installment.number - 1));
      const list = byKey.get(key) ?? [];
      list.push({ known: { transaction, installment }, anchor });
      byKey.set(key, list);
    }

    const purchases: InstallmentPurchase[] = [];
    for (const items of byKey.values()) {
      items.sort(
        (a, b) =>
          a.anchor.monthKey.localeCompare(b.anchor.monthKey) ||
          a.known.installment.number - b.known.installment.number ||
          a.known.transaction.occurredOn.toString().localeCompare(b.known.transaction.occurredOn.toString()),
      );
      const open: { purchase: InstallmentPurchase; anchor: LocalDate }[] = [];
      for (const { known, anchor } of items) {
        const number = known.installment.number;
        const cents = known.transaction.amount.abs().cents;
        const fits = (c: { purchase: InstallmentPurchase; anchor: LocalDate }) =>
          !c.purchase.has(number) &&
          monthsBetween(c.anchor, anchor) <= 1 &&
          c.purchase.hasInstallmentValueCloseTo(cents);
        const target = open.find((c) => fits(c) && c.anchor.monthKey === anchor.monthKey) ?? open.find((c) => fits(c));
        if (target) {
          target.purchase.add(known);
          continue;
        }
        const purchase = new InstallmentPurchase(
          known.transaction.accountId,
          normalizeMerchant(known.transaction.description),
          known.installment.total,
          anchor.monthKey,
        );
        purchase.add(known);
        open.push({ purchase, anchor });
        purchases.push(purchase);
      }
    }
    return purchases;
  }

  /** Soma das parcelas a vencer em cada um dos próximos `months` meses, a partir do mês de `from`. */
  commitments(purchases: readonly InstallmentPurchase[], from: LocalDate, months: number): MonthlyCommitment[] {
    const projected = purchases.flatMap((p) => p.projectRemaining());
    return Array.from({ length: months }, (_, i) => {
      const month = from.addMonths(i).monthKey;
      return { month, amount: Money.sum(projected.filter((p) => p.expectedMonth === month).map((p) => p.amount)) };
    });
  }
}

function monthsBetween(a: LocalDate, b: LocalDate): number {
  return Math.abs(a.year * 12 + a.month - (b.year * 12 + b.month));
}
