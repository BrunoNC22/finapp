/** Porta: hora atual. Injetada para que casos de uso e geradores sejam deterministas nos testes. */
export abstract class Clock {
  abstract now(): Date;
}
