import type { Document } from '../../../shared/kernel/document.js';
import { DomainError } from '../../../shared/kernel/domain-error.js';
import type { LocalDate } from '../../../shared/kernel/local-date.js';
import type { Money } from '../../../shared/kernel/money.js';
import type { Installment } from './installment.js';

export class InvalidTransactionError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export type PaymentMethod =
  | 'pix'
  | 'ted_doc'
  | 'boleto'
  | 'card_purchase'
  | 'bill_payment'
  | 'fee'
  | 'interest'
  | 'yield'
  | 'cashback'
  | 'refund'
  | 'other';

export type TransactionStatus = 'pending' | 'posted';
export type Classification = 'income' | 'expense' | 'internal_transfer' | 'ignored';
/** Quem decidiu a classificação. Uma decisão manual nunca é sobrescrita automaticamente. */
export type ClassificationSource = 'default' | 'matcher' | 'manual';
/** `learned`: aprendida com correções manuais do usuário para a mesma contraparte. */
export type CategorySource = 'provider' | 'rule' | 'learned' | 'manual';
export type Direction = 'inflow' | 'outflow' | 'none';

export interface Counterparty {
  readonly name?: string;
  readonly document?: Document;
}

export interface CategoryAssignment {
  readonly categoryId: string;
  readonly source: CategorySource;
}

export interface TransactionProps {
  readonly id: string;
  readonly accountId: string;
  /** Id da transação no provedor de Open Finance. */
  readonly externalId: string;
  readonly occurredOn: LocalDate;
  /** Negativo = dinheiro saindo do usuário (inclusive compras no cartão). */
  readonly amount: Money;
  readonly description: string;
  readonly paymentMethod: PaymentMethod;
  readonly status: TransactionStatus;
  readonly counterparty?: Counterparty;
  readonly installment?: Installment;
  /** Categoria sugerida pelo provedor (id dele), usada pelo mapa de categorias. */
  readonly providerCategoryId?: string;
}

export interface TransactionState {
  readonly classification: Classification;
  readonly classificationSource: ClassificationSource;
  readonly transferLink?: string;
  readonly category?: CategoryAssignment;
}

const CATEGORY_PRECEDENCE: Record<CategorySource, number> = { provider: 0, rule: 1, learned: 2, manual: 3 };

/**
 * Movimento financeiro em uma conta do usuário (raiz de agregado).
 *
 * Convenção de sinal: o valor é sempre do ponto de vista do usuário. Negativo é dinheiro saindo
 * (gasto, inclusive compra no cartão) e positivo é entrando (renda, estorno, pagamento recebido pelo cartão).
 */
export class Transaction {
  private constructor(
    private props: TransactionProps,
    private state: TransactionState,
  ) {}

  /** Registra uma transação nova, com a classificação padrão derivada da forma de pagamento. */
  static record(props: TransactionProps): Transaction {
    Transaction.validate(props);
    return new Transaction(props, {
      classification: Transaction.defaultClassification(props),
      classificationSource: 'default',
    });
  }

  /** Reconstrói uma transação persistida, com o estado de classificação e categoria já decidido. */
  static restore(props: TransactionProps, state: TransactionState): Transaction {
    Transaction.validate(props);
    return new Transaction(props, state);
  }

  private static validate(props: TransactionProps): void {
    for (const [field, value] of [
      ['id', props.id],
      ['conta', props.accountId],
      ['id externo', props.externalId],
      ['descrição', props.description],
    ] as const) {
      if (!value.trim()) throw new InvalidTransactionError(`${field} é obrigatório`);
    }
    if (props.installment && props.paymentMethod !== 'card_purchase') {
      throw new InvalidTransactionError('só compras no cartão podem ser parceladas');
    }
  }

  private static defaultClassification(props: TransactionProps): Classification {
    switch (props.paymentMethod) {
      case 'bill_payment':
        return 'internal_transfer';
      case 'refund':
        return 'expense';
      case 'yield':
      case 'cashback':
        return 'income';
      default:
        return props.amount.isPositive() ? 'income' : 'expense';
    }
  }

  get id(): string {
    return this.props.id;
  }
  get accountId(): string {
    return this.props.accountId;
  }
  get externalId(): string {
    return this.props.externalId;
  }
  get occurredOn(): LocalDate {
    return this.props.occurredOn;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get description(): string {
    return this.props.description;
  }
  get paymentMethod(): PaymentMethod {
    return this.props.paymentMethod;
  }
  get status(): TransactionStatus {
    return this.props.status;
  }
  get counterparty(): Counterparty | undefined {
    return this.props.counterparty;
  }
  get installment(): Installment | undefined {
    return this.props.installment;
  }
  get providerCategoryId(): string | undefined {
    return this.props.providerCategoryId;
  }
  get classification(): Classification {
    return this.state.classification;
  }
  get classificationSource(): ClassificationSource {
    return this.state.classificationSource;
  }
  get transferLink(): string | undefined {
    return this.state.transferLink;
  }
  get category(): CategoryAssignment | undefined {
    return this.state.category;
  }

  get direction(): Direction {
    if (this.amount.isPositive()) return 'inflow';
    if (this.amount.isNegative()) return 'outflow';
    return 'none';
  }

  get isInstallment(): boolean {
    return this.props.installment !== undefined;
  }

  /** Snapshot imutável para persistência. */
  snapshot(): { readonly props: TransactionProps; readonly state: TransactionState } {
    return { props: this.props, state: this.state };
  }

  /**
   * Marca como transferência entre contas do próprio usuário, opcionalmente ligada à outra ponta.
   * Retorna false (sem alterar nada) se o usuário já classificou manualmente.
   */
  markAsInternalTransfer(counterpartId?: string): boolean {
    if (counterpartId === this.id) throw new InvalidTransactionError('uma transação não pode ser par de si mesma');
    if (this.state.classificationSource === 'manual') return false;
    this.state = {
      ...this.state,
      classification: 'internal_transfer',
      classificationSource: 'matcher',
      ...(counterpartId ? { transferLink: counterpartId } : {}),
    };
    return true;
  }

  /** Decisão do usuário: prevalece sobre qualquer classificação automática. */
  classifyManually(classification: Classification, counterpartId?: string): void {
    if (counterpartId === this.id) throw new InvalidTransactionError('uma transação não pode ser par de si mesma');
    const { transferLink: _previous, ...rest } = this.state;
    this.state = {
      ...rest,
      classification,
      classificationSource: 'manual',
      ...(classification === 'internal_transfer' && counterpartId ? { transferLink: counterpartId } : {}),
    };
  }

  /**
   * Atribui uma categoria respeitando a precedência manual > regra > provedor.
   * Retorna false se uma decisão de precedência maior já existir.
   */
  /**
   * Atualiza os dados que pertencem ao provedor (status, valor, descrição, data…) preservando as
   * decisões do usuário. A classificação padrão é recalculada se ninguém decidiu ainda.
   */
  refreshFromProvider(props: TransactionProps): void {
    if (
      props.id !== this.props.id ||
      props.accountId !== this.props.accountId ||
      props.externalId !== this.props.externalId
    ) {
      throw new InvalidTransactionError('a atualização do provedor não pode mudar a identidade da transação');
    }
    Transaction.validate(props);
    this.props = props;
    if (this.state.classificationSource === 'default') {
      this.state = { ...this.state, classification: Transaction.defaultClassification(props) };
    }
  }

  /**
   * O provedor pode apagar uma transação pendente e recriá-la (com outro id) ao lançá-la.
   * A nova herda as decisões MANUAIS da antiga (categoria e classificação).
   */
  inheritUserDecisionsFrom(previous: Transaction): void {
    if (previous.category?.source === 'manual') this.categorize(previous.category.categoryId, 'manual');
    if (previous.classificationSource === 'manual') this.classifyManually(previous.classification);
  }

  /**
   * A outra ponta desfez a transferência: remove a ligação e volta à classificação padrão.
   * Usado quando o usuário corrige a conciliação do outro lado.
   */
  releaseTransfer(): void {
    const { transferLink: _removed, ...rest } = this.state;
    this.state = {
      ...rest,
      classification: Transaction.defaultClassification(this.props),
      classificationSource: 'default',
    };
  }

  /** Remove a categoria automática (regra ou provedor) para recalcular. A manual é preservada. */
  clearAutomaticCategory(): void {
    if (!this.state.category || this.state.category.source === 'manual') return;
    const { category: _removed, ...rest } = this.state;
    this.state = rest;
  }

  categorize(categoryId: string, source: CategorySource): boolean {
    const current = this.state.category;
    if (current && CATEGORY_PRECEDENCE[current.source] > CATEGORY_PRECEDENCE[source]) return false;
    this.state = { ...this.state, category: { categoryId, source } };
    return true;
  }
}
