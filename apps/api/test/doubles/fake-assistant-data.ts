import {
  AssistantData,
  type Json,
  type TransactionQuery,
} from '../../src/modules/assistant/application/assistant-data.js';

/** Dublê (stub + spy) da porta: registra as chamadas e devolve um eco. */
export class FakeAssistantData extends AssistantData {
  readonly calls: unknown[][] = [];
  /** O que o resumo devolve como mês corrente quando nenhum é pedido. */
  currentMonth = '2026-11';
  private record(name: string, ...args: unknown[]): Json {
    this.calls.push([name, ...args]);
    return { ferramenta: name, args };
  }
  async monthSummary(month?: string) {
    return { ...this.record('monthSummary', month), mes: month ?? this.currentMonth };
  }
  async spendingByCategory(month: string | undefined, level: 'grupo' | 'categoria') {
    return this.record('spendingByCategory', month, level);
  }
  async transactions(query: TransactionQuery) {
    return this.record('transactions', query);
  }
  async commitments() {
    return this.record('commitments');
  }
  async recurring() {
    return this.record('recurring');
  }
  async income(months: number) {
    return this.record('income', months);
  }
  async goals(deadline?: string) {
    return this.record('goals', deadline);
  }
  async profile() {
    return this.record('profile');
  }
  async opportunities(onlyOpen: boolean) {
    return this.record('opportunities', onlyOpen);
  }
  async connections() {
    return this.record('connections');
  }
}
