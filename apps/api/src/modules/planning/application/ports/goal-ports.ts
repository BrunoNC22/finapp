import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { Money } from '../../../../shared/kernel/money.js';
import type { Goal } from '../../domain/goals/goal.js';
import type { Baseline } from '../../domain/goals/plan-simulator.js';

/** Metas na ordem em que o usuário quer realizá-las. */
export abstract class GoalRepository {
  abstract findAll(): Promise<Goal[]>;
  abstract findById(id: string): Promise<Goal | undefined>;
  /** Mantém a posição de uma meta existente; uma nova vai para o fim da fila. */
  abstract save(goal: Goal): Promise<void>;
  abstract delete(id: string): Promise<boolean>;
  abstract reorder(ids: readonly string[]): Promise<void>;
}

/** O que o planejamento precisa saber das finanças reais (vem do ledger). */
export abstract class HouseholdFinances {
  abstract costOfLiving(from: LocalDate, to: LocalDate, months: number): Promise<Baseline>;
  abstract availableBalance(): Promise<Money>;
}
