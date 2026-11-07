/** Recurso pedido não existe (a apresentação traduz para 404). */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Não autenticado (a apresentação traduz para 401, com mensagem genérica). */
export class UnauthorizedError extends Error {
  constructor(message = 'não autorizado') {
    super(message);
    this.name = new.target.name;
  }
}

/** Muitas tentativas (429), com o tempo para tentar de novo. */
export class TooManyAttemptsError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
