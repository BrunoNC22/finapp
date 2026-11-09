import { AnalysisLog, type AnalysisRecord } from '../../src/modules/routine/application/monthly-analysis-routine.js';

export class InMemoryAnalysisLog extends AnalysisLog {
  private readonly records = new Map<string, AnalysisRecord>();
  async find(month: string) {
    const r = this.records.get(month);
    return r ? { ...r, at: new Date(r.at) } : undefined;
  }
  async save(record: AnalysisRecord) {
    this.records.set(record.month, { ...record, at: new Date(record.at) });
  }
}
