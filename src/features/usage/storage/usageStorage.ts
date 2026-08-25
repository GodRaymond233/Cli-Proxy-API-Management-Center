import type { UsageRecord, UsageFilterParams } from '@/types/usage';
import { usageDb } from './idbStorage';

export const usageStorage = {
  async saveRecords(records: UsageRecord[]): Promise<void> {
    return usageDb.addRecords(records);
  },

  async query(filter: UsageFilterParams): Promise<UsageRecord[]> {
    return usageDb.queryRecords(filter);
  },

  async count(): Promise<number> {
    return usageDb.countRecords();
  },

  async clear(): Promise<void> {
    return usageDb.clearAllRecords();
  },
};
