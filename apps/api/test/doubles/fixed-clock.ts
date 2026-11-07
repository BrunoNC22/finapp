import { Clock } from '../../src/shared/application/clock.js';

/** Relógio parado num instante fixo (stub). */
export class FixedClock extends Clock {
  constructor(private instant: Date) {
    super();
  }
  now(): Date {
    return new Date(this.instant);
  }
  advanceMinutes(minutes: number): void {
    this.instant = new Date(this.instant.getTime() + minutes * 60_000);
  }

  advanceDays(days: number): void {
    this.instant = new Date(this.instant.getTime() + days * 86_400_000);
  }
}
