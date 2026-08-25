import { useCallback, useEffect, useState } from 'react';
import type { UsageRecord, UsageFilterParams } from '@/types/usage';
import { usageStorage } from '../storage/usageStorage';
import { generateSampleUsageRecords } from '../mock/sampleDataGenerator';

export function useUsageRecords(filter: UsageFilterParams, autoRefresh = false) {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      let count = await usageStorage.count();
      // Auto populate sample records if storage is entirely empty on first load
      if (count === 0) {
        const samples = generateSampleUsageRecords(350);
        await usageStorage.saveRecords(samples);
        count = samples.length;
      }

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

  const loadSampleData = useCallback(async () => {
    const samples = generateSampleUsageRecords(350);
    await usageStorage.saveRecords(samples);
    await fetchRecords();
  }, [fetchRecords]);

  return {
    records,
    loading,
    totalCount,
    refetch: fetchRecords,
    clearRecords,
    loadSampleData,
  };
}
