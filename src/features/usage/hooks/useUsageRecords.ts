import { useCallback, useEffect, useState } from 'react';
import type { UsageRecord, UsageFilterParams } from '@/types/usage';
import { usageStorage } from '../storage/usageStorage';

export function useUsageRecords(filter: UsageFilterParams, autoRefresh = false) {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const count = await usageStorage.count();
      const results = await usageStorage.query(filter);
      setRecords(results);
      setTotalCount(count);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // Periodic polling
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchRecords();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchRecords]);

  const clearRecords = useCallback(async () => {
    await usageStorage.clear();
    setRecords([]);
    setTotalCount(0);
  }, []);

  return {
    records,
    loading,
    totalCount,
    refetch: fetchRecords,
    clearRecords,
  };
}
