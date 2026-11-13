import type { Clock } from '../../../shared/application/clock.js';
import { DomainError } from '../../../shared/kernel/domain-error.js';
import { LocalDate } from '../../../shared/kernel/local-date.js';
import { YearMonth } from '../../../shared/kernel/year-month.js';

export type AnalysisOutcome = 'feita' | 'pulada';
/** Por onde a análise foi registrada: pela skill (CLI no servidor) ou pelo botão no app. */
export type AnalysisChannel = 'skill' | 'app' | 'mcp';

export interface AnalysisRecord {
  readonly month: string;
  readonly outcome: AnalysisOutcome;
  readonly via: AnalysisChannel;
  readonly at: Date;
}

/** Registro das análises mensais: um por mês, o último vale. */
export abstract class AnalysisLog {
  abstract find(month: string): Promise<AnalysisRecord | undefined>;
  abstract save(record: AnalysisRecord): Promise<void>;
}

export interface AnalysisReminder {
  readonly month: string;
  readonly pending: boolean;
  readonly record?: AnalysisRecord;
}

export class AnalysisMonthNotClosedError extends DomainError {
  // biome-ignore lint/complexity/noUselessConstructor: torna público o construtor protegido de DomainError
  constructor(message: string) {
    super(message);
  }
}

const TIME_ZONE = 'America/Sao_Paulo';
const closedMonth = (clock: Clock, timeZone: string): YearMonth =>
  YearMonth.of(LocalDate.fromInstant(clock.now(), timeZone)).addMonths(-1);

/** O lembrete do app: o último mês fechado (no fuso do Brasil) fica pendente até ser analisado ou pulado. */
export class GetAnalysisReminder {
  constructor(
    private readonly log: AnalysisLog,
    private readonly clock: Clock,
    private readonly timeZone = TIME_ZONE,
  ) {}

  async execute(): Promise<AnalysisReminder> {
    const month = closedMonth(this.clock, this.timeZone).toString();
    const record = await this.log.find(month);
    return record ? { month, pending: false, record } : { month, pending: true };
  }
}

/** Marca um mês fechado como analisado (ou pulado). Sem mês: o último fechado. */
export class RecordMonthlyAnalysis {
  constructor(
    private readonly log: AnalysisLog,
    private readonly clock: Clock,
    private readonly timeZone = TIME_ZONE,
  ) {}

  async execute(input: { month?: string; outcome: AnalysisOutcome; via: AnalysisChannel }): Promise<AnalysisRecord> {
    const closed = closedMonth(this.clock, this.timeZone);
    const month = input.month ? YearMonth.parse(input.month) : closed;
    if (month.isAfter(closed)) {
      throw new AnalysisMonthNotClosedError(
        `${month.toString()} ainda não fechou; o último mês fechado é ${closed.toString()}`,
      );
    }
    const record: AnalysisRecord = {
      month: month.toString(),
      outcome: input.outcome,
      via: input.via,
      at: this.clock.now(),
    };
    await this.log.save(record);
    return record;
  }
}
