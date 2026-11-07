/** Recurso pedido não existe (a apresentação traduz para 404). */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
