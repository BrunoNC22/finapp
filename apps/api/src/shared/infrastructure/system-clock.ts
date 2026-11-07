import { Clock } from '../application/clock.js';

/** Relógio real do sistema. */
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
