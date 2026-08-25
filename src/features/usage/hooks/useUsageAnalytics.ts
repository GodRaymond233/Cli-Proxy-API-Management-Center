import { useMemo } from 'react';
import type {
  UsageRecord,
  UsageKpiSummary,
  HourlyTrendBucket,
  RankItem,
  HourlyDistributionItem,
} from '@/types/usage';

export function useUsageAnalytics(records: UsageRecord[]) {
  // 1. KPI Summary
  const kpi = useMemo<UsageKpiSummary>(() => {
    if (!records.length) {
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        successRate: 100,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheHitRate: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        rpm: 0,
        tps: 0,
        totalCostUsd: 0,
        avgCostPerRequestUsd: 0,
        pricedRequestsCount: 0,
      };
    }

    let successfulRequests = 0;
    let failedRequests = 0;
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let totalLatency = 0;
    let totalCostUsd = 0;
    let pricedCount = 0;

    const latencies: number[] = [];

    records.forEach((r) => {
      if (r.statusCode >= 200 && r.statusCode < 400) {
        successfulRequests += 1;
      } else {
        failedRequests += 1;
      }

      const u = r.usage;
      inputTokens += u.inputTokens;
      outputTokens += u.outputTokens;
      totalTokens += u.totalTokens;
      reasoningTokens += u.reasoningTokens ?? 0;
      cacheReadTokens += u.cacheReadTokens ?? 0;
      cacheWriteTokens += u.cacheWriteTokens ?? 0;

      totalLatency += r.latencyMs;
      latencies.push(r.latencyMs);

      if (r.estimatedCostUsd > 0) {
        totalCostUsd += r.estimatedCostUsd;
        pricedCount += 1;
      }
    });

    latencies.sort((a, b) => a - b);
    const p95Index = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95));
    const p95LatencyMs = latencies[p95Index] || 0;

    const totalRequests = records.length;
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;
    const cacheHitRate = inputTokens > 0 ? (cacheReadTokens / inputTokens) * 100 : 0;
    const avgLatencyMs = totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0;

    // Time window calculation for TPS and RPM
    const earliestTime = records[records.length - 1]?.timestamp ?? Date.now();
    const latestTime = records[0]?.timestamp ?? Date.now();
    const timeSpanSeconds = Math.max(60, (latestTime - earliestTime) / 1000);
    const timeSpanMinutes = timeSpanSeconds / 60;

    const rpm = parseFloat((totalRequests / timeSpanMinutes).toFixed(2));
    const tps = parseFloat((outputTokens / timeSpanSeconds).toFixed(1));

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate: parseFloat(successRate.toFixed(1)),
      totalTokens,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cacheHitRate: parseFloat(cacheHitRate.toFixed(1)),
      avgLatencyMs,
      p95LatencyMs,
      rpm,
      tps,
      totalCostUsd: parseFloat(totalCostUsd.toFixed(3)),
      avgCostPerRequestUsd:
        totalRequests > 0 ? parseFloat((totalCostUsd / totalRequests).toFixed(4)) : 0,
      pricedRequestsCount: pricedCount,
    };
  }, [records]);

  // 2. Hourly Trend Buckets
  const hourlyTrends = useMemo<HourlyTrendBucket[]>(() => {
    if (!records.length) return [];

    const bucketMap = new Map<number, HourlyTrendBucket>();

    records.forEach((r) => {
      const date = new Date(r.timestamp);
      date.setMinutes(0, 0, 0);
      const hourTs = date.getTime();

      let bucket = bucketMap.get(hourTs);
      if (!bucket) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        bucket = {
          hourTimestamp: hourTs,
          hourLabel: `${month}-${day} ${hours}:00`,
          requestCount: 0,
          successCount: 0,
          failureCount: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          estimatedCostUsd: 0,
        };
        bucketMap.set(hourTs, bucket);
      }

      bucket.requestCount += 1;
      if (r.statusCode >= 200 && r.statusCode < 400) {
        bucket.successCount += 1;
      } else {
        bucket.failureCount += 1;
      }

      bucket.totalTokens += r.usage.totalTokens;
      bucket.inputTokens += r.usage.inputTokens;
      bucket.outputTokens += r.usage.outputTokens;
      bucket.reasoningTokens += r.usage.reasoningTokens ?? 0;
      bucket.cacheReadTokens += r.usage.cacheReadTokens ?? 0;
      bucket.cacheWriteTokens += r.usage.cacheWriteTokens ?? 0;
      bucket.estimatedCostUsd += r.estimatedCostUsd;
    });

    const sorted = Array.from(bucketMap.values()).sort(
      (a, b) => a.hourTimestamp - b.hourTimestamp
    );
    return sorted;
  }, [records]);

  // 3. Model Usage Rankings
  const modelRanks = useMemo<RankItem[]>(() => {
    if (!records.length) return [];
    const map = new Map<string, { count: number; tokens: number; cost: number }>();

    records.forEach((r) => {
      const key = r.normalizedModel || r.model;
      const cur = map.get(key) || { count: 0, tokens: 0, cost: 0 };
      cur.count += 1;
      cur.tokens += r.usage.totalTokens;
      cur.cost += r.estimatedCostUsd;
      map.set(key, cur);
    });

    const totalTokens = Array.from(map.values()).reduce((sum, item) => sum + item.tokens, 0);

    return Array.from(map.entries())
      .map(([id, item]) => ({
        id,
        label: id,
        count: item.count,
        tokens: item.tokens,
        costUsd: parseFloat(item.cost.toFixed(3)),
        percentage: totalTokens > 0 ? parseFloat(((item.tokens / totalTokens) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [records]);

  // 4. Provider Rankings
  const providerRanks = useMemo<RankItem[]>(() => {
    if (!records.length) return [];
    const map = new Map<string, { count: number; tokens: number; cost: number }>();

    records.forEach((r) => {
      const key = r.provider || 'unknown';
      const cur = map.get(key) || { count: 0, tokens: 0, cost: 0 };
      cur.count += 1;
      cur.tokens += r.usage.totalTokens;
      cur.cost += r.estimatedCostUsd;
      map.set(key, cur);
    });

    const totalTokens = Array.from(map.values()).reduce((sum, item) => sum + item.tokens, 0);

    return Array.from(map.entries())
      .map(([id, item]) => ({
        id,
        label: id,
        count: item.count,
        tokens: item.tokens,
        costUsd: parseFloat(item.cost.toFixed(3)),
        percentage: totalTokens > 0 ? parseFloat(((item.tokens / totalTokens) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [records]);

  // 5. Key Rankings
  const keyRanks = useMemo<RankItem[]>(() => {
    if (!records.length) return [];
    const map = new Map<string, { count: number; tokens: number; cost: number }>();

    records.forEach((r) => {
      const key = r.keyName || '未备注密钥';
      const cur = map.get(key) || { count: 0, tokens: 0, cost: 0 };
      cur.count += 1;
      cur.tokens += r.usage.totalTokens;
      cur.cost += r.estimatedCostUsd;
      map.set(key, cur);
    });

    const totalTokens = Array.from(map.values()).reduce((sum, item) => sum + item.tokens, 0);

    return Array.from(map.entries())
      .map(([id, item]) => ({
        id,
        label: id,
        count: item.count,
        tokens: item.tokens,
        costUsd: parseFloat(item.cost.toFixed(3)),
        percentage: totalTokens > 0 ? parseFloat(((item.tokens / totalTokens) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [records]);

  // 6. 24-Hour Distribution Histogram
  const hourlyDistribution = useMemo<HourlyDistributionItem[]>(() => {
    const distribution = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      requestCount: 0,
      percentage: 0,
      tokenCount: 0,
    }));

    if (!records.length) return distribution;

    records.forEach((r) => {
      const hour = new Date(r.timestamp).getHours();
      distribution[hour].requestCount += 1;
      distribution[hour].tokenCount += r.usage.totalTokens;
    });

    const total = records.length;
    distribution.forEach((d) => {
      d.percentage = total > 0 ? parseFloat(((d.requestCount / total) * 100).toFixed(1)) : 0;
    });

    return distribution;
  }, [records]);

  return {
    kpi,
    hourlyTrends,
    modelRanks,
    providerRanks,
    keyRanks,
    hourlyDistribution,
  };
}
