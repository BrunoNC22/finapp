/** Porta: gera identificadores novos. Injetada para manter casos de uso deterministas nos testes. */
export abstract class IdGenerator {
  abstract next(): string;
}
