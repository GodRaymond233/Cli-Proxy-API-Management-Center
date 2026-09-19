import { describe, expect, test } from 'bun:test';
import {
  classifyTokenSemantics,
  computeInputSideTokens,
  resolveRecordCacheHitRate,
  resolveRecordInputSideTokens,
} from '../src/features/usage/tokenSemantics';
import { parseUsageQueueRecord } from '../src/features/usage/collector/logCollector';
import { parsePluginRequestRecord } from '../src/features/usage/collector/pluginBackfillCollector';
import type { UsageRecord } from '../src/types/usage';

const record = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  id: 'r1',
  requestId: '--------',
  timestamp: Date.parse('2026-09-15T10:00:00Z'),
  model: 'gpt-5.6-sol',
  normalizedModel: 'GPT-5.6 Sol',
  provider: 'codex',
  endpoint: '',
  httpMethod: 'POST',
  statusCode: 200,
  latencyMs: 1000,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
  estimatedCostUsd: 0,
  ...overrides,
});

describe('token semantics classification', () => {
  test('codex/openai family is subset (input includes cache)', () => {
    expect(classifyTokenSemantics('codex', 'CodexExecutor')).toBe('subset');
    expect(classifyTokenSemantics('openai', undefined)).toBe('subset');
    expect(classifyTokenSemantics('openai-compatibility', 'OpenAICompatExecutor')).toBe('subset');
    expect(classifyTokenSemantics('gemini', 'GeminiExecutor')).toBe('subset');
  });

  test('anthropic family is independent (input excludes cache)', () => {
    expect(classifyTokenSemantics('anthropic', 'ClaudeExecutor')).toBe('independent');
    expect(classifyTokenSemantics('claude', undefined)).toBe('independent');
  });

  test('unknown provider falls back to data-driven detection', () => {
    expect(classifyTokenSemantics('', '')).toBe('unknown');
    expect(classifyTokenSemantics('unknown', 'unknown')).toBe('unknown');
  });
});

describe('input side tokens denominator', () => {
  // 2026-09-15 面板真实样本：Codex 行 input 215,070 已含缓存 211,968
  test('subset semantics keeps input_tokens as denominator', () => {
    expect(computeInputSideTokens(215070, 211968, 0, 'codex')).toBe(215070);
  });

  test('independent semantics sums input + cache read + cache write', () => {
    expect(computeInputSideTokens(8745, 129792, 35168, 'anthropic')).toBe(173705);
  });

  test('unknown with cache larger than input implies independent', () => {
    expect(computeInputSideTokens(1000, 2000, 0)).toBe(3000);
  });

  test('unknown with cache inside input implies subset', () => {
    expect(computeInputSideTokens(1000, 200, 0)).toBe(1000);
  });

  test('missing input tokens defaults denominator to cache total', () => {
    expect(computeInputSideTokens(0, 5000, 0, 'codex')).toBe(5000);
  });
});

describe('record-level cache hit rate', () => {
  test('codex high-hit row shows ~98.6% instead of the halved 49.6%', () => {
    const r = record({
      usage: { inputTokens: 215070, outputTokens: 812, cacheReadTokens: 211968, totalTokens: 215882 },
    });
    expect(resolveRecordCacheHitRate(r).toFixed(1)).toBe('98.6');
  });

  test('anthropic record keeps independent denominator', () => {
    const r = record({
      provider: 'anthropic',
      usage: { inputTokens: 8745, outputTokens: 892, cacheReadTokens: 129792, cacheWriteTokens: 35168, totalTokens: 174597 },
    });
    expect(resolveRecordCacheHitRate(r).toFixed(1)).toBe('74.7');
  });

  test('legacy indexedDB record without inputSideTokens recomputes from provider', () => {
    const r = record({
      usage: { inputTokens: 215070, outputTokens: 812, cacheReadTokens: 211968, totalTokens: 215882 },
    });
    expect(r.usage.inputSideTokens).toBeUndefined();
    expect(resolveRecordInputSideTokens(r)).toBe(215070);
  });

  test('stored inputSideTokens (token_breakdown) wins over provider semantics', () => {
    const r = record({
      provider: 'unknown',
      usage: { inputTokens: 1000, outputTokens: 10, cacheReadTokens: 800, inputSideTokens: 900, totalTokens: 1010 },
    });
    expect(resolveRecordInputSideTokens(r)).toBe(900);
  });

  test('record without cache yields zero rate', () => {
    const r = record({
      usage: { inputTokens: 1000, outputTokens: 10, totalTokens: 1010 },
    });
    expect(resolveRecordCacheHitRate(r)).toBe(0);
  });
});

describe('collectors persist the input-side denominator', () => {
  test('usage-queue record prefers canonical token_breakdown', () => {
    const payload = {
      timestamp: '2026-09-15T18:00:00+08:00',
      latency_ms: 2533,
      failed: false,
      tokens: {
        input_tokens: 215070,
        output_tokens: 812,
        reasoning_tokens: 0,
        cache_read_tokens: 211968,
        total_tokens: 215882,
      },
      token_breakdown: {
        schema_version: 2,
        quality: 'complete',
        input: {
          total_tokens: 215070,
          uncached_tokens: 3102,
          cache_read_tokens: 211968,
          cache_write_tokens: 0,
        },
      },
      provider: 'codex',
      executor_type: 'CodexExecutor',
      model: 'gpt-5.6-sol',
      alias: 'gpt-5.6-sol',
      auth_type: 'oauth',
    };
    const parsed = parseUsageQueueRecord(payload)!;
    expect(parsed.usage.inputSideTokens).toBe(215070);
    expect(parsed.executorType).toBe('CodexExecutor');
    expect(resolveRecordCacheHitRate(parsed).toFixed(1)).toBe('98.6');
  });

  test('usage-queue record without breakdown falls back to provider semantics', () => {
    const payload = {
      timestamp: '2026-09-15T18:00:00+08:00',
      latency_ms: 2533,
      failed: false,
      tokens: {
        input_tokens: 215070,
        output_tokens: 812,
        cache_read_tokens: 211968,
        total_tokens: 215882,
      },
      provider: 'codex',
      model: 'gpt-5.6-sol',
      alias: 'gpt-5.6-sol',
      auth_type: 'oauth',
    };
    const parsed = parseUsageQueueRecord(payload)!;
    expect(parsed.usage.inputSideTokens).toBe(215070);
    expect(resolveRecordCacheHitRate(parsed).toFixed(1)).toBe('98.6');
  });

  test('queue record without cache keeps inputSideTokens unset', () => {
    const payload = {
      timestamp: '2026-09-15T18:00:00+08:00',
      latency_ms: 2533,
      failed: false,
      tokens: { input_tokens: 7, output_tokens: 13, total_tokens: 20 },
      provider: 'codex',
      model: 'gpt-5.6-sol',
      alias: 'gpt-5.6-sol',
      auth_type: 'oauth',
    };
    const parsed = parseUsageQueueRecord(payload)!;
    expect(parsed.usage.inputSideTokens).toBeUndefined();
  });

  test('plugin backfill record computes denominator from provider/executor', () => {
    const item = {
      sequence: 1,
      time: '2026-09-15T10:00:00.0000000Z',
      provider: 'anthropic',
      executor_type: 'ClaudeExecutor',
      model: 'claude-sonnet-4.6',
      alias: 'claude-sonnet-4.6',
      auth_type: 'oauth',
      failed: false,
      failure_status: 0,
      input_tokens: 8745,
      output_tokens: 892,
      reasoning_tokens: 0,
      cached_tokens: 0,
      cache_read_tokens: 129792,
      cache_creation_tokens: 35168,
      total_tokens: 174597,
      latency_ns: 2533317500,
      ttft_ns: 1510613700,
      result: '成功',
    };
    const parsed = parsePluginRequestRecord(item)!;
    expect(parsed.usage.inputSideTokens).toBe(173705);
    expect(parsed.executorType).toBe('ClaudeExecutor');
    expect(resolveRecordCacheHitRate(parsed).toFixed(1)).toBe('74.7');
  });
});
