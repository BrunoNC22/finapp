import type { Collection, Db } from 'mongodb';
import { AnalysisLog, type AnalysisRecord } from '../application/monthly-analysis-routine.js';

export const ROUTINE_COLLECTIONS = { analyses: 'monthly_analyses' } as const;

type AnalysisDocument = Omit<AnalysisRecord, 'month'> & { _id: string };

/** Um documento por mês (`_id` = AAAA-MM). */
export class MongoAnalysisLog extends AnalysisLog {
  private readonly collection: Collection<AnalysisDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<AnalysisDocument>(ROUTINE_COLLECTIONS.analyses);
  }
  async find(month: string): Promise<AnalysisRecord | undefined> {
    const doc = await this.collection.findOne({ _id: month });
    return doc ? { month: doc._id, outcome: doc.outcome, via: doc.via, at: doc.at } : undefined;
  }
  async save(record: AnalysisRecord): Promise<void> {
    const { month, ...rest } = record;
    await this.collection.replaceOne({ _id: month }, rest, { upsert: true });
  }
}
