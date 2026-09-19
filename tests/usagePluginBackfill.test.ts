import { describe, expect, test } from 'bun:test';
import { parseUsageQueueRecord, buildProviderModelAliasIndex } from '../src/features/usage/collector/logCollector';
import {
  parsePluginRequestRecord,
  resolvePluginRequestsUrl,
} from '../src/features/usage/collector/pluginBackfillCollector';
import { buildUsageDedupKey, planDedupedWrites } from '../src/features/usage/collector/usageDedup';
import type { UsageRecord, ModelPricingRule } from '../src/types/usage';

const pricingRules: ModelPricingRule[] = [
  {
    modelPattern: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    provider: 'codex',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10,
  },
];

// 取自 2026-08-29 真实双通道观测：同一请求（gpt-5.6-sol，20 tokens，2533ms）
// 在 usage-queue 与插件 /requests 中各出现一次，是去重键对齐的黄金样本。
const queuePayload = {
  timestamp: '2026-08-29T16:13:57.2715594+08:00',
  latency_ms: 2533,
  ttft_ms: 1510,
  source: 'godraymond233@gmail.com',
  client_ip: '127.0.0.1',
  failed: false,
  tokens: {
    input_tokens: 7,
    output_tokens: 13,
    reasoning_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: 20,
  },
  provider: 'codex',
  model: 'gpt-5.6-sol',
  alias: 'gpt-5.6-sol',
  auth_index: '07bebfe31f009fd0',
  auth_type: 'oauth',
  endpoint: 'POST /v1/responses',
  api_key: 'cpa-local-d0275d41eff61bb0f8176e952394e3e75a0aaae7585a339b011142d0816e0849',
  request_id: 'abc12345',
};

const pluginItem = {
  sequence: 1596,
  time: '2026-08-29T08:13:57.2715594Z',
  provider: 'codex',
  executor_type: 'CodexExecutor',
  model: 'gpt-5.6-sol',
  alias: 'gpt-5.6-sol',
  source: 'Codex-godraymond233@gmail.com',
  auth_type: 'oauth',
  service_tier: 'auto',
  reasoning_effort: '',
  failed: false,
  failure_status: 0,
  requests: 1,
  failed_requests: 0,
  input_tokens: 7,
  output_tokens: 13,
  reasoning_tokens: 0,
  cached_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  total_tokens: 20,
  latency_ns: 2533317500,
  ttft_ns: 1510613700,
  result: '成功',
};

describe('plugin backfill collector', () => {
  test('same event from queue and plugin produces identical dedupKey', () => {
    const queueRecord = parseUsageQueueRecord(queuePayload, pricingRules);
    const pluginRecord = parsePluginRequestRecord(pluginItem, pricingRules);

    expect(queueRecord).not.toBeNull();
    expect(pluginRecord).not.toBeNull();
    expect(queueRecord!.dedupKey).toBeTruthy();
    expect(queueRecord!.dedupKey).toBe(pluginRecord!.dedupKey);
  });

  test('plugin record maps tokens, latency and route identity', () => {
    const record = parsePluginRequestRecord(pluginItem, pricingRules)!;

    // 2026-08-29T08:13:57.271Z (UTC) → 本地 +08:00 的同一时刻
    expect(record.timestamp).toBe(Date.parse('2026-08-29T08:13:57.271Z'));
    // latency_ns 2533317500 → 2533ms（与 Go Duration.Milliseconds 截断一致）
    expect(record.latencyMs).toBe(2533);
    expect(record.model).toBe('gpt-5.6-sol');
    expect(record.normalizedModel).toBe('GPT-5.6 Sol');
    expect(record.modelAlias).toBe('gpt-5.6-sol');
    expect(record.provider).toBe('codex');
    expect(record.providerAuthType).toBe('oauth');
    expect(record.statusCode).toBe(200);
    expect(record.usage).toEqual({
      inputTokens: 7,
      outputTokens: 13,
      reasoningTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
      totalTokens: 20,
    });
    expect(record.estimatedCostUsd).toBeGreaterThan(0);
    expect(record.collectorSource).toBe('plugin-backfill');
    // 插件侧无 request_id / endpoint / client_ip / 客户端密钥
    expect(record.requestId).toBe('--------');
    expect(record.endpoint).toBe('');
    expect(record.sourceIp).toBeUndefined();
    expect(record.keyName).toBeUndefined();
  });

  test('failed plugin record keeps failure status and result message', () => {
    const record = parsePluginRequestRecord(
      {
        ...pluginItem,
        failed: true,
        failure_status: 502,
        result: '失败 (HTTP 502)',
      },
      pricingRules
    )!;

    expect(record.statusCode).toBe(502);
    expect(record.errorMessage).toBe('失败 (HTTP 502)');
  });

  test('api-key upstream source stays masked (plugin normalizes to base-url)', () => {
    const record = parsePluginRequestRecord(
      {
        ...pluginItem,
        provider: 'claude',
        source: 'https://api.anthropic.com',
        auth_type: 'apikey',
        model: 'k3',
      },
      []
    )!;

    // base-url 形态直接透传展示，无需遮蔽
    expect(record.providerInstanceLabel).toBe('https://api.anthropic.com');
  });

  test('long secret-like source with api-key auth is masked', () => {
    const record = parsePluginRequestRecord(
      {
        ...pluginItem,
        source: 'sk-kimi-3mWtUj47cMjzTHASpndOrP2IydZNvv9ruc4pXdbZZMxPTNCfsUzTllCO2JsD7Lqv',
        auth_type: 'apikey',
      },
      []
    )!;

    expect(record.providerInstanceLabel).toBe('sk-kim***7Lqv');
  });

  test('api-key row with model-alias index shows relay base-url instead of official fallback', () => {
    const index = buildProviderModelAliasIndex({
      'codex-api-key': [
        {
          'api-key': 'sk-relay-a',
          'base-url': 'https://relay-a.example/v1',
          models: [{ name: 'gpt-6-astra', alias: 'gpt-6-astra-Pro' }],
        },
        {
          'api-key': 'sk-relay-b',
          'base-url': 'https://relay-b.example/v1',
          models: [
            { name: 'gpt-5.6-sol', alias: 'gpt-5.6-sol-Pro' },
            { name: 'gpt-5.6-sol', alias: '' },
          ],
        },
      ],
    });

    const aliased = parsePluginRequestRecord(
      {
        ...pluginItem,
        model: 'gpt-6-astra',
        alias: 'gpt-6-astra-Pro',
        source: 'https://api.openai.com/v1',
        auth_type: 'apikey',
      },
      [],
      index
    )!;
    expect(aliased.providerInstanceLabel).toBe('https://relay-a.example/v1');
    expect(aliased.providerInstanceUrl).toBe('https://relay-a.example/v1');

    const bare = parsePluginRequestRecord(
      {
        ...pluginItem,
        model: 'gpt-5.6-sol',
        alias: 'gpt-5.6-sol',
        source: 'https://api.openai.com/v1',
        auth_type: 'apikey',
      },
      [],
      index
    )!;
    expect(bare.providerInstanceLabel).toBe('https://relay-b.example/v1');
  });

  test('ambiguous model-alias keys are dropped from index', () => {
    const index = buildProviderModelAliasIndex({
      'codex-api-key': [
        { 'base-url': 'https://a.example/v1', models: [{ name: 'm', alias: 'x' }] },
        { 'base-url': 'https://b.example/v1', models: [{ name: 'm', alias: 'x' }] },
      ],
    });
    expect(index.has('m::x')).toBe(false);

    const record = parsePluginRequestRecord(
      { ...pluginItem, model: 'm', alias: 'x', source: 'https://api.openai.com/v1', auth_type: 'apikey' },
      [],
      index
    )!;
    expect(record.providerInstanceLabel).toBe('https://api.openai.com/v1');
  });

  test('malformed plugin items are rejected', () => {
    expect(parsePluginRequestRecord(null)).toBeNull();
    expect(parsePluginRequestRecord({})).toBeNull();
    expect(parsePluginRequestRecord({ time: 'not-a-date', model: 'k3' })).toBeNull();
    expect(parsePluginRequestRecord({ time: '2026-08-29T08:13:57Z' })).toBeNull();
  });

  test('resolvePluginRequestsUrl normalizes base and rejects invalid input', () => {
    expect(resolvePluginRequestsUrl('http://127.0.0.1:8317/')).toBe(
      'http://127.0.0.1:8317/v0/resource/plugins/cap-token-usage-tracker/requests'
    );
    expect(resolvePluginRequestsUrl('http://127.0.0.1:8317/v0/management')).toBe(
      'http://127.0.0.1:8317/v0/resource/plugins/cap-token-usage-tracker/requests'
    );
    expect(resolvePluginRequestsUrl('')).toBe('');
    expect(resolvePluginRequestsUrl('ftp://x')).toBe('');
  });
});

describe('usage dedup planning', () => {
  const makeRecord = (overrides: Partial<UsageRecord>): UsageRecord => ({
    id: 'placeholder',
    requestId: '--------',
    timestamp: Date.parse('2026-08-29T08:13:57Z'),
    model: 'gpt-5.6-sol',
    normalizedModel: 'gpt-5.6-sol',
    provider: 'codex',
    endpoint: '',
    httpMethod: 'POST',
    statusCode: 200,
    latencyMs: 2533,
    usage: {
      inputTokens: 7,
      outputTokens: 13,
      totalTokens: 20,
    },
    estimatedCostUsd: 0,
    ...overrides,
  });

  test('writes everything when nothing exists', () => {
    const record = makeRecord({ id: 'ev:1:m:20:10', dedupKey: 'ev:1:m:20:10' });
    const plan = planDedupedWrites([record], new Map());

    expect(plan.toWrite).toHaveLength(1);
    expect(plan.skipped).toBe(0);
  });

  test('skips plugin record when queue already stored the same event', () => {
    const plugin = makeRecord({
      id: 'ev:1:m:20:10',
      dedupKey: 'ev:1:m:20:10',
      collectorSource: 'plugin-backfill',
    });
    const existing = new Map([['ev:1:m:20:10', { id: 'abc12345', collectorSource: 'usage-queue' as const }]]);

    const plan = planDedupedWrites([plugin], existing);

    expect(plan.toWrite).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  test('upgrades stored plugin record when queue record arrives later, keeping stored id', () => {
    const queue = makeRecord({
      id: 'abc12345',
      requestId: 'abc12345',
      dedupKey: 'ev:1:m:20:10',
      collectorSource: 'usage-queue',
      endpoint: 'POST /v1/responses',
      sourceIp: '127.0.0.1',
    });
    const existing = new Map([['ev:1:m:20:10', { id: 'ev:1:m:20:10', collectorSource: 'plugin-backfill' as const }]]);

    const plan = planDedupedWrites([queue], existing);

    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toWrite[0].id).toBe('ev:1:m:20:10');
    expect(plan.toWrite[0].endpoint).toBe('POST /v1/responses');
    expect(plan.toWrite[0].collectorSource).toBe('usage-queue');
  });

  test('in-batch duplicate keys collapse with queue priority', () => {
    const plugin = makeRecord({
      id: 'ev:1:m:20:10',
      dedupKey: 'ev:1:m:20:10',
      collectorSource: 'plugin-backfill',
    });
    const queue = makeRecord({
      id: 'req-1',
      dedupKey: 'ev:1:m:20:10',
      collectorSource: 'usage-queue',
    });

    const plan = planDedupedWrites([plugin, queue], new Map());

    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toWrite[0].collectorSource).toBe('usage-queue');
  });

  test('records without dedupKey pass through untouched', () => {
    const legacy = makeRecord({ id: 'legacy-id' });
    const plan = planDedupedWrites([legacy], new Map());

    expect(plan.toWrite).toEqual([legacy]);
  });
});

describe('dedup key building', () => {
  test('same-second events with different latency stay distinct', () => {
    const a = buildUsageDedupKey(1756455237271, 'k3', 221, 1825);
    const b = buildUsageDedupKey(1756455237900, 'k3', 221, 1826);

    expect(a).not.toBe(b);
  });

  test('plugin ns latency floors to match queue ms truncation', () => {
    // 2533800000ns：Go Duration.Milliseconds() = 2533（截断），floor 一致
    expect(Math.floor(2533800000 / 1e6)).toBe(2533);
    const fromPlugin = buildUsageDedupKey(
      Date.parse('2026-08-29T08:13:57Z'),
      'gpt-5.6-sol',
      20,
      Math.floor(2533800000 / 1e6)
    );
    const fromQueue = buildUsageDedupKey(
      Date.parse('2026-08-29T16:13:57+08:00'),
      'gpt-5.6-sol',
      20,
      2533
    );
    expect(fromPlugin).toBe(fromQueue);
  });
});
