import { randomUUID } from 'node:crypto';
import { IdGenerator } from '../application/id-generator.js';

export class UuidIdGenerator extends IdGenerator {
  next(): string {
    return randomUUID();
  }
}
