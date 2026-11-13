import { DomainError } from '../../../../shared/kernel/domain-error.js';
import { Money } from '../../../../shared/kernel/money.js';

export class InvalidGoalError extends DomainError {
  // biome-ignore lint/complexity/noUselessConstructor: torna público o construtor protegido de DomainError
  constructor(message: string) {
    super(message);
  }
}

/** `purchase`: comprar algo · `lifestyle`: custo de vida novo · `reserve`: dinheiro guardado · `debt`: quitar dívida. */
export type GoalKind = 'purchase' | 'lifestyle' | 'reserve' | 'debt';

export type Financing =
  | { readonly kind: 'cash' }
  /** Financiamento pela Tabela Price. */
  | { readonly kind: 'loan'; readonly installments: number; readonly monthlyRate: number }
  /** Parcelado sem juros (cartão, parcelamento de dívida sem juros). */
  | { readonly kind: 'interest_free'; readonly installments: number }
  /** Consórcio: sem juros, com taxa de administração sobre o valor. */
  | { readonly kind: 'consortium'; readonly installments: number; readonly adminFeeRate: number };

/**
 * Custo mensal que passa a existir com a meta. Com `replacesCategoryId`, o gasto médio atual daquela
 * categoria SAI do orçamento (ex.: bike elétrica no lugar do app; aluguel próprio no lugar da ajuda em casa).
 */
export interface RecurringCost {
  readonly name: string;
  readonly monthly: Money;
  readonly replacesCategoryId?: string;
}

/** Categoria do bem de uma meta de compra. Só informativa: organiza e dá contexto ao assistente. */
export type AssetCategoryKind = 'vehicle' | 'electronics' | 'home' | 'other';
export interface AssetCategory {
  readonly kind: AssetCategoryKind;
  /** Nome livre, só na categoria `other`. */
  readonly label?: string;
}

/** O bem vendido: o de uma meta de compra que vem antes na fila, ou um que a pessoa já tem hoje. */
export type TradeInSource =
  | { readonly kind: 'goal'; readonly goalId: string }
  | { readonly kind: 'owned'; readonly name: string; readonly currentValue: Money };

/**
 * Um bem vendido na largada da meta para ajudar a pagá-la (ex.: vender a bike elétrica para dar a entrada da moto).
 * O valor de venda cai `annualDepreciationRate` ao ano (composto, mês a mês): a partir do preço e do mês de
 * compra, no bem de uma meta; a partir do valor de hoje, no bem que a pessoa já tem.
 */
export interface TradeIn {
  readonly source: TradeInSource;
  /** Fração perdida por ano (0,2 = 20% a.a.). */
  readonly annualDepreciationRate: number;
}

/** Valor de um bem depois de `months` meses, perdendo `annualRate` ao ano (composto). */
export function depreciatedValue(value: Money, annualRate: number, months: number): Money {
  return Money.fromCents(Math.round(value.cents * (1 - annualRate) ** (months / 12)));
}

export interface GoalProps {
  readonly id: string;
  readonly name: string;
  readonly kind: GoalKind;
  /** Valor do bem/dívida/reserva (0 para estilo de vida puro). */
  readonly price: Money;
  /** Entrada, paga com o que foi guardado (ignorada à vista: paga-se tudo). */
  readonly downPayment: Money;
  /** Custos únicos no início (CNH, equipamento, caução, ITBI…). */
  readonly oneTimeCosts: Money;
  readonly financing: Financing;
  readonly recurringCosts: readonly RecurringCost[];
  /** Só em metas de compra. */
  readonly category?: AssetCategory;
  /** Bens vendidos na largada para ajudar a pagar (ausente = nenhum). */
  readonly tradeIns?: readonly TradeIn[];
}

/** Uma meta e quanto ela custa: na largada, por mês e no total. */
export class Goal {
  private constructor(readonly props: GoalProps) {
    Object.freeze(this);
  }

  static create(props: GoalProps): Goal {
    if (!props.id.trim()) throw new InvalidGoalError('id é obrigatório');
    if (!props.name.trim()) throw new InvalidGoalError('dê um nome à meta');
    for (const [value, label] of [
      [props.price, 'o valor'],
      [props.downPayment, 'a entrada'],
      [props.oneTimeCosts, 'os custos únicos'],
    ] as const) {
      if (value.isNegative()) throw new InvalidGoalError(`${label} não pode ser negativo`);
    }
    const f = props.financing;
    if (f.kind !== 'cash') {
      if (props.downPayment.isGreaterThan(props.price))
        throw new InvalidGoalError('a entrada não pode passar do valor');
      if (!Number.isInteger(f.installments) || f.installments < 1 || f.installments > 480) {
        throw new InvalidGoalError('o número de parcelas precisa ser inteiro, de 1 a 480');
      }
    }
    if (f.kind === 'loan' && !(f.monthlyRate >= 0 && f.monthlyRate < 0.2)) {
      throw new InvalidGoalError('juros mensais entre 0% e 20%');
    }
    if (f.kind === 'consortium' && !(f.adminFeeRate >= 0 && f.adminFeeRate < 1)) {
      throw new InvalidGoalError('taxa de administração entre 0% e 100%');
    }
    if (props.recurringCosts.some((c) => c.monthly.isNegative() || !c.name.trim())) {
      throw new InvalidGoalError('custos recorrentes precisam de nome e valor não negativo');
    }
    const category = validCategory(props);
    const tradeIns = validTradeIns(props);
    const { category: _category, ...rest } = props;
    return new Goal({ ...rest, name: props.name.trim(), ...(category ? { category } : {}), tradeIns });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }

  get tradeIns(): readonly TradeIn[] {
    return this.props.tradeIns ?? [];
  }

  withTradeIns(tradeIns: readonly TradeIn[]): Goal {
    return Goal.create({ ...this.props, tradeIns });
  }

  /** Quanto precisa estar guardado para começar. */
  upfront(): Money {
    const { financing, price, downPayment, oneTimeCosts } = this.props;
    return (financing.kind === 'cash' ? price : downPayment).add(oneTimeCosts);
  }

  installments(): number {
    return this.props.financing.kind === 'cash' ? 0 : this.props.financing.installments;
  }

  /** Parcela mensal (centavos arredondados). */
  installment(): Money {
    const f = this.props.financing;
    if (f.kind === 'cash') return Money.zero();
    const principal = this.props.price.subtract(this.props.downPayment).cents;
    if (f.kind === 'interest_free') return Money.fromCents(Math.round(principal / f.installments));
    if (f.kind === 'consortium')
      return Money.fromCents(Math.round((principal * (1 + f.adminFeeRate)) / f.installments));
    const i = f.monthlyRate;
    const pmt = i === 0 ? principal / f.installments : (principal * i) / (1 - (1 + i) ** -f.installments);
    return Money.fromCents(Math.round(pmt));
  }

  /** Saldo devedor depois de `paid` parcelas pagas: o que uma venda precisa quitar. */
  outstandingBalance(paid: number): Money {
    const f = this.props.financing;
    const remaining = this.installments() - Math.max(0, paid);
    if (f.kind === 'cash' || remaining <= 0) return Money.zero();
    const installment = this.installment().cents;
    if (f.kind !== 'loan' || f.monthlyRate === 0) return Money.fromCents(installment * remaining);
    const i = f.monthlyRate;
    return Money.fromCents(Math.round((installment * (1 - (1 + i) ** -remaining)) / i));
  }

  totalCost(): Money {
    return this.upfront().add(Money.fromCents(this.installment().cents * this.installments()));
  }

  /** Soma dos custos recorrentes que a meta acrescenta. */
  recurringAdds(): Money {
    return Money.sum(this.props.recurringCosts.map((c) => c.monthly));
  }

  /** Categorias cujo gasto atual deixa de existir com a meta. */
  replacedCategories(): string[] {
    return [...new Set(this.props.recurringCosts.flatMap((c) => (c.replacesCategoryId ? [c.replacesCategoryId] : [])))];
  }
}

function validCategory(props: GoalProps): AssetCategory | undefined {
  const c = props.category;
  if (!c) return undefined;
  if (props.kind !== 'purchase') throw new InvalidGoalError('só metas de compra têm categoria de bem');
  const label = c.label?.trim();
  if (label && c.kind !== 'other') throw new InvalidGoalError('o nome livre da categoria é só para "Outro"');
  return label ? { kind: c.kind, label } : { kind: c.kind };
}

function validTradeIns(props: GoalProps): TradeIn[] {
  const seen = new Set<string>();
  return (props.tradeIns ?? []).map((t) => {
    if (!(t.annualDepreciationRate >= 0 && t.annualDepreciationRate < 1)) {
      throw new InvalidGoalError('a desvalorização anual precisa ficar entre 0% e 99%');
    }
    const s = t.source;
    if (s.kind === 'goal') {
      if (!s.goalId.trim()) throw new InvalidGoalError('diga qual meta tem o bem vendido');
      if (s.goalId === props.id) throw new InvalidGoalError('uma meta não pode vender o próprio bem');
      if (seen.has(s.goalId)) throw new InvalidGoalError('o mesmo bem aparece duas vezes na venda');
      seen.add(s.goalId);
      return { source: { kind: 'goal', goalId: s.goalId }, annualDepreciationRate: t.annualDepreciationRate };
    }
    if (!s.name.trim()) throw new InvalidGoalError('dê um nome ao bem vendido');
    if (s.currentValue.isNegative()) throw new InvalidGoalError('o valor do bem vendido não pode ser negativo');
    return {
      source: { kind: 'owned', name: s.name.trim(), currentValue: s.currentValue },
      annualDepreciationRate: t.annualDepreciationRate,
    };
  });
}
