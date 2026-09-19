import type { UsageRecord, UsageFilterParams } from '@/types/usage';
import { usageDb, type UsageSyncMeta } from './idbStorage';
import { planDedupedWrites } from '../collector/usageDedup';

export const usageStorage = {
  async saveRecords(records: UsageRecord[]): Promise<void> {
    return usageDb.addRecords(records);
  },

  /**
   * 双通道采集（usage-queue 实时 + 插件库回填）统一落库入口：
   * 按 dedupKey 幂等去重后写入，usage-queue 来源（字段最全）优先。
   */
  async saveRecordsDeduped(records: UsageRecord[]): Promise<{
    toWrite: UsageRecord[];
    skipped: number;
  }> {
    const withKey = records.filter((r) => r.dedupKey);
    const existing = await usageDb.getExistingDedupEntries(
      withKey.map((r) => r.dedupKey as string)
    );
    const plan = planDedupedWrites(records, existing);
    if (plan.toWrite.length) {
      await usageDb.addRecords(plan.toWrite);
    }
    return plan;
  },

  async getSyncMeta(): Promise<UsageSyncMeta> {
    return usageDb.getSyncMeta();
  },

  async setSyncMeta(meta: UsageSyncMeta): Promise<void> {
    return usageDb.setSyncMeta(meta);
  },

  async getNewestRecordTimestamp(): Promise<number | null> {
    return usageDb.getNewestRecordTimestamp();
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
