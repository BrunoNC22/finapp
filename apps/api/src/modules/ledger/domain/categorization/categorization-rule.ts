import { Document } from '../../../../shared/kernel/document.js';
import { DomainError } from '../../../../shared/kernel/domain-error.js';
import type { Money } from '../../../../shared/kernel/money.js';
import type { Direction, PaymentMethod, Transaction } from '../transaction.js';

export class InvalidRuleError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export interface CategorizationRuleProps {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  /** Menor número = maior prioridade. */
  readonly priority: number;
  readonly enabled: boolean;
  // Condições (todas as informadas precisam bater).
  readonly descriptionContains?: string;
  readonly descriptionPattern?: string;
  readonly counterpartyDocument?: string;
  readonly counterpartyNameContains?: string;
  readonly accountId?: string;
  readonly paymentMethod?: PaymentMethod;
  readonly direction?: Exclude<Direction, 'none'>;
  /** Faixa de valor absoluto (inclusiva). */
  readonly minAmount?: Money;
  readonly maxAmount?: Money;
}

const CONDITION_KEYS = [
  'descriptionContains',
  'descriptionPattern',
  'counterpartyDocument',
  'counterpartyNameContains',
  'accountId',
  'paymentMethod',
  'direction',
  'minAmount',
  'maxAmount',
] as const;

/** Texto sem acentos e em minúsculas, para comparar descrições. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Regra do usuário: "transações que batem com estas condições vão para esta categoria".
 * Vive no banco (pode conter nomes e documentos de pessoas), nunca no código.
 */
export class CategorizationRule {
  private constructor(
    readonly props: CategorizationRuleProps,
    private readonly pattern: RegExp | undefined,
    private readonly document: Document | undefined,
  ) {}

  static create(props: CategorizationRuleProps): CategorizationRule {
    if (!props.categoryId.trim()) throw new InvalidRuleError('a regra precisa de uma categoria');
    if (!CONDITION_KEYS.some((key) => props[key] !== undefined && props[key] !== '')) {
      throw new InvalidRuleError('a regra precisa de pelo menos uma condição');
    }
    let pattern: RegExp | undefined;
    if (props.descriptionPattern) {
      try {
        pattern = new RegExp(props.descriptionPattern, 'i');
      } catch {
        throw new InvalidRuleError('expressão regular inválida');
      }
    }
    const document = props.counterpartyDocument ? Document.parse(props.counterpartyDocument) : undefined;
    if (props.minAmount && props.maxAmount && props.minAmount.abs().isGreaterThan(props.maxAmount.abs())) {
      throw new InvalidRuleError('valor mínimo maior que o máximo');
    }
    return new CategorizationRule(props, pattern, document);
  }

  get id(): string {
    return this.props.id;
  }
  get categoryId(): string {
    return this.props.categoryId;
  }
  get priority(): number {
    return this.props.priority;
  }
  get enabled(): boolean {
    return this.props.enabled;
  }

  matches(transaction: Transaction): boolean {
    if (!this.props.enabled) return false;
    const p = this.props;
    const description = foldText(transaction.description);
    if (p.descriptionContains && !description.includes(foldText(p.descriptionContains))) return false;
    if (this.pattern && !this.pattern.test(description)) return false;
    if (this.document) {
      const other = transaction.counterparty?.document;
      if (!other || !this.document.isSameAs(other)) return false;
    }
    if (p.counterpartyNameContains) {
      const name = transaction.counterparty?.name;
      if (!name || !foldText(name).includes(foldText(p.counterpartyNameContains))) return false;
    }
    if (p.accountId && transaction.accountId !== p.accountId) return false;
    if (p.paymentMethod && transaction.paymentMethod !== p.paymentMethod) return false;
    if (p.direction && transaction.direction !== p.direction) return false;
    const amount = transaction.amount.abs();
    if (p.minAmount && amount.isLessThan(p.minAmount.abs())) return false;
    if (p.maxAmount && amount.isGreaterThan(p.maxAmount.abs())) return false;
    return true;
  }
}
