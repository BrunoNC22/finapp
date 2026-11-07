import { IdGenerator } from '../../src/shared/application/id-generator.js';

/** Gera ids previsíveis: "<prefixo>-1", "<prefixo>-2"… */
export class SequentialIdGenerator extends IdGenerator {
  private counter = 0;
  constructor(private readonly prefix = 'id') {
    super();
  }
  next(): string {
    return `${this.prefix}-${++this.counter}`;
  }
}
