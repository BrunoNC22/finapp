import { DomainError } from './domain-error.js';

export class InvalidDocumentError extends DomainError {
  constructor() {
    // A mensagem nunca inclui o valor recebido: é dado pessoal.
    super('documento deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos)');
  }
}

export type DocumentType = 'CPF' | 'CNPJ';

/**
 * CPF ou CNPJ. Documentos de terceiros podem vir parcialmente mascarados pelo banco
 * (ex.: "***.456.789-**"). Por isso a igualdade só vale entre documentos completos.
 * Nunca se imprime: toString/toJSON ocultam o número.
 */
export class Document {
  private constructor(
    readonly type: DocumentType,
    /** Dígitos e `*` (posições mascaradas). Use só para persistir e comparar. */
    readonly value: string,
  ) {
    Object.freeze(this);
  }

  static parse(raw: string): Document {
    const value = raw.replace(/[^\d*]/g, '');
    if (!/\d/.test(value)) throw new InvalidDocumentError();
    if (value.length === 11) return new Document('CPF', value);
    if (value.length === 14) return new Document('CNPJ', value);
    throw new InvalidDocumentError();
  }

  get isMasked(): boolean {
    return this.value.includes('*');
  }

  /**
   * Mesma pessoa/empresa. Só vale entre documentos completos. No CPF, comparam-se os 9 dígitos da
   * base: os 2 últimos são verificadores (calculados a partir da base) e há bancos que os mandam errados.
   */
  isSameAs(other: Document): boolean {
    if (this.isMasked || other.isMasked || this.type !== other.type) return false;
    return this.type === 'CPF' ? this.value.slice(0, 9) === other.value.slice(0, 9) : this.value === other.value;
  }

  toString(): string {
    return `${this.type} (oculto)`;
  }

  toJSON(): string {
    return this.toString();
  }
}
