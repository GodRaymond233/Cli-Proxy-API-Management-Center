import { useCallback, useEffect, useRef, useState } from 'react';
import type { UsageRecord, UsageFilterParams } from '@/types/usage';
import { usageStorage, type UsageStorage } from '../storage/usageStorage';

export function useUsageRecords(
  filter: UsageFilterParams,
  autoRefresh = false,
  storage: UsageStorage = usageStorage
) {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const requestGeneration = useRef(0);

  const fetchRecords = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const count = await storage.count();
      const results = await storage.query(filter);
      if (generation !== requestGeneration.current) return;
      setRecords(results);
      setTotalCount(count);
    } catch {
      if (generation !== requestGeneration.current) return;
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filter, storage]);

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
    ++requestGeneration.current;
    await storage.clear();
    setRecords([]);
    setTotalCount(0);
  }, [storage]);

  return {
    records,
    loading,
    totalCount,
    refetch: fetchRecords,
    clearRecords,
  };
}
