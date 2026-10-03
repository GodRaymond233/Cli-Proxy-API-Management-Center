import { describe, expect, test } from 'bun:test';
import { percentile95LatencyMs } from '../src/features/usage/hooks/useUsageAnalytics';

describe('usage latency percentile', () => {
  test('uses the nearest-rank p95 instead of the maximum for twenty samples', () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(percentile95LatencyMs(values)).toBe(19);
  });

  test('does not mutate the input and handles empty samples', () => {
    const values = [30, 10, 20];
    expect(percentile95LatencyMs(values)).toBe(30);
    expect(values).toEqual([30, 10, 20]);
    expect(percentile95LatencyMs([])).toBe(0);
  });
});
