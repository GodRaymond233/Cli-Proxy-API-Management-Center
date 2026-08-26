import { describe, expect, test } from 'bun:test';
import {
  parseUsageQueueRecord,
  maskInstanceLabel,
  buildProviderInstanceIndex,
  type ProviderInstanceIndex,
} from '../src/features/usage/collector/logCollector';
import type { ModelPricingRule } from '../src/types/usage';

const basePayload = (overrides: Record<string, unknown> = {}) => ({
  timestamp: '2026-08-26T11:26:04.7729844+08:00',
  latency_ms: 5447,
  source: 'godraymond233@gmail.com',
  client_ip: '127.0.0.1',
  failed: false,
  tokens: {
    input_tokens: 132178,
    output_tokens: 3869,
    cache_read_tokens: 98295,
    total_tokens: 136047,
  },
  provider: 'codex',
  model: 'gpt-5.6-sol',
  alias: 'gpt-5.6-sol',
  original_alias: 'gpt-5.6-sol',
  auth_index: '07bebfe31f009fd0',
  endpoint: 'POST /v1/responses',
  api_key: 'cpa-management-key-0849',
  request_id: 'c73d87fd',
  ...overrides,
});

const pricingRules: ModelPricingRule[] = [
  {
    modelPattern: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    provider: 'codex',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10,
  },
];

const moyuuKey = 'sk-moyuu-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
const providerIndex: ProviderInstanceIndex = new Map([
  ['a1b2c3d4e5f6a7b8', { name: 'moyuu', baseUrl: 'https://api.moyuu.example/v1' }],
]);

describe('usage route identity', () => {
  test('same requested model + provider type, different provider instances stay distinguishable', () => {
    const official = parseUsageQueueRecord(basePayload(), pricingRules);
    const moyuu = parseUsageQueueRecord(
      basePayload({
        source: 'moyuu-relay',
        auth_index: 'a1b2c3d4e5f6a7b8',
        request_id: '50d88b24',
      }),
      pricingRules
    );

    expect(official).not.toBeNull();
    expect(moyuu).not.toBeNull();
    expect(official!.model).toBe(moyuu!.model);
    expect(official!.provider).toBe(moyuu!.provider);
    expect(official!.providerInstanceLabel).toBe('godraymond233@gmail.com');
    expect(moyuu!.providerInstanceLabel).toBe('moyuu-relay');
    expect(official!.providerInstanceId).not.toBe(moyuu!.providerInstanceId);
  });

  test('pricing displayName no longer overrides route identity fields', () => {
    const record = parseUsageQueueRecord(
      basePayload({ alias: 'moyuu-gpt-sol', original_alias: 'gpt-5.6-sol' }),
      pricingRules
    );
    expect(record!.normalizedModel).toBe('GPT-5.6 Sol');
    expect(record!.modelAlias).toBe('moyuu-gpt-sol');
    expect(record!.requestedModel).toBe('gpt-5.6-sol');
    expect(record!.model).toBe('gpt-5.6-sol');
  });

  test('old payload without route fields degrades without crashing', () => {
    const record = parseUsageQueueRecord(
      basePayload({
        model: 'internal-unknown-model',
        source: undefined,
        auth_index: undefined,
        alias: undefined,
        original_alias: undefined,
      }),
      []
    );
    expect(record).not.toBeNull();
    expect(record!.providerInstanceLabel).toBeUndefined();
    expect(record!.providerInstanceId).toBeUndefined();
    expect(record!.modelAlias).toBeUndefined();
    expect(record!.requestedModel).toBeUndefined();
    expect(record!.normalizedModel).toBe('internal-unknown-model');
  });

  test('token, cache and cost accounting unchanged', () => {
    const record = parseUsageQueueRecord(basePayload(), pricingRules);
    expect(record!.usage.inputTokens).toBe(132178);
    expect(record!.usage.outputTokens).toBe(3869);
    expect(record!.usage.cacheReadTokens).toBe(98295);
    expect(record!.estimatedCostUsd).toBeCloseTo(0.093330625, 9);
    expect(record!.statusCode).toBe(200);
    expect(record!.latencyMs).toBe(5447);
  });

  test('api-key shaped source is masked, email and short names pass through', () => {
    const record = parseUsageQueueRecord(basePayload({ source: moyuuKey }), pricingRules);
    expect(record!.providerInstanceLabel).toBe('sk-moy***9a0b');
    expect(record!.providerInstanceLabel).not.toContain('1a2b3c4d5e6f');

    const email = parseUsageQueueRecord(basePayload(), pricingRules);
    expect(email!.providerInstanceLabel).toBe('godraymond233@gmail.com');

    expect(maskInstanceLabel('moyuu-relay')).toBe('moyuu-relay');
    expect(maskInstanceLabel(undefined)).toBeUndefined();
    // 幂等：已脱敏值再次经过不变
    expect(maskInstanceLabel('sk-moy***9a0b')).toBe('sk-moy***9a0b');
  });

  test('api-key auth type masks short, at-sign and whitespace variants', () => {
    for (const source of ['short-key', 'key-with@sign', 'key with whitespace']) {
      const record = parseUsageQueueRecord(
        basePayload({ source, auth_type: 'api-key' }),
        pricingRules
      );
      expect(record!.providerInstanceLabel).not.toBe(source);
      expect(JSON.stringify(record)).not.toContain(source);
    }
    expect(maskInstanceLabel('short-key', 'api-key')).toBe('sh***ey');

    expect(maskInstanceLabel('not-an-email@secret-value-that-is-long')).not.toBe(
      'not-an-email@secret-value-that-is-long'
    );
    expect(maskInstanceLabel('https://relay.example/v1')).toBe('https://relay.example/v1');
    expect(maskInstanceLabel('https://user:secret@relay.example/v1')).not.toBe(
      'https://user:secret@relay.example/v1'
    );
  });

  test('api-key instance resolves to relay URL via auth_index, key never stored', () => {
    const record = parseUsageQueueRecord(
      basePayload({
        source: moyuuKey,
        auth_type: 'api-key',
        auth_index: 'a1b2c3d4e5f6a7b8',
      }),
      pricingRules,
      providerIndex
    );
    expect(record!.providerAuthType).toBe('api-key');
    expect(record!.providerInstanceUrl).toBe('https://api.moyuu.example/v1');
    expect(record!.providerInstanceLabel).toBe('https://api.moyuu.example/v1');
    expect(JSON.stringify(record)).not.toContain(moyuuKey);
  });

  test('oauth instance keeps email label and auth type', () => {
    const record = parseUsageQueueRecord(
      basePayload({ auth_type: 'oauth' }),
      pricingRules,
      providerIndex
    );
    expect(record!.providerAuthType).toBe('oauth');
    expect(record!.providerInstanceLabel).toBe('godraymond233@gmail.com');
    expect(record!.providerInstanceUrl).toBeUndefined();
  });

  test('codex-api-key section resolves Moyuu relay URL by api-key match', () => {
    const index = buildProviderInstanceIndex({
      'codex-api-key': [
        { 'api-key': moyuuKey, 'base-url': 'https://long.moyuu.cc/v1', 'auth-index': 'ffeeddccbbaa0099' },
        { 'api-key': 'sk-other-0000000000000000000000000000', 'base-url': 'https://code28.ccwu.cc/v1' },
      ],
      'openai-compatibility': [
        {
          name: 'compat-relay',
          'base-url': 'https://compat.example/v1',
          'api-key-entries': [
            { 'api-key': 'compat-key-0000000000000000000000000', 'auth-index': 'compat-idx-0001' },
          ],
        },
      ],
    });

    const byAuthIndex = parseUsageQueueRecord(
      basePayload({ source: moyuuKey, auth_type: 'api-key', auth_index: 'ffeeddccbbaa0099' }),
      pricingRules,
      index
    );
    expect(byAuthIndex!.providerInstanceUrl).toBe('https://long.moyuu.cc/v1');
    expect(JSON.stringify(byAuthIndex)).not.toContain(moyuuKey);

    const byKeyOnly = parseUsageQueueRecord(
      basePayload({ source: moyuuKey, auth_type: 'api-key', auth_index: undefined }),
      pricingRules,
      index
    );
    expect(byKeyOnly!.providerInstanceUrl).toBe('https://long.moyuu.cc/v1');

    expect(index.get('compat-key-0000000000000000000000000')?.baseUrl).toBe(
      'https://compat.example/v1'
    );
    expect(index.get(moyuuKey)?.baseUrl).toBe('https://long.moyuu.cc/v1');

    const unsafeIndex = buildProviderInstanceIndex({
      'codex-api-key': [
        { 'api-key': moyuuKey, 'base-url': 'https://relay.example/v1?api-key=secret' },
      ],
    });
    expect(unsafeIndex.size).toBe(0);
  });

  test('reasoning effort is captured from payload', () => {
    const record = parseUsageQueueRecord(basePayload({ reasoning_effort: 'xhigh' }), pricingRules);
    expect(record!.reasoningEffort).toBe('xhigh');
    const none = parseUsageQueueRecord(basePayload({ reasoning_effort: undefined }), pricingRules);
    expect(none!.reasoningEffort).toBeUndefined();
  });

  test('known keys are redacted from persisted failure details', () => {
    const clientKey = 'client-key-1234567890abcdef';
    const record = parseUsageQueueRecord(
      basePayload({
        source: moyuuKey,
        auth_type: 'api-key',
        api_key: clientKey,
        failed: true,
        fail: { status_code: 401, body: `upstream ${moyuuKey}; client ${clientKey}` },
      }),
      pricingRules
    );
    const persisted = JSON.stringify(record);
    expect(persisted).not.toContain(moyuuKey);
    expect(persisted).not.toContain(clientKey);
    expect(record!.statusCode).toBe(401);

    const boundaryRecord = parseUsageQueueRecord(
      basePayload({
        source: moyuuKey,
        auth_type: 'api-key',
        failed: true,
        fail: { status_code: 500, body: `${'x'.repeat(495)}${moyuuKey}` },
      }),
      pricingRules
    );
    expect(boundaryRecord!.errorMessage).not.toContain(moyuuKey.slice(0, 5));
  });
});
