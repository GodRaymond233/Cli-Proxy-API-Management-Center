import type { UsageRecord, TokenUsage, ModelPricingRule } from '@/types/usage';
import { calculateUsageCost, matchPricingRule } from '../pricing/costEngine';

/**
 * CPA usage-queue 记录（GET /v0/management/usage-queue，取出即弹出）。
 * 字段定义见 CLIProxyAPI internal/redisqueue/plugin.go 的 queuedUsageDetail。
 */
interface UsageQueueRecord {
  timestamp?: string;
  latency_ms?: number;
  client_ip?: string;
  failed?: boolean;
  fail?: { status_code?: number; body?: string };
  tokens?: {
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
    total_tokens?: number;
  };
  provider?: string;
  model?: string;
  alias?: string;
  original_alias?: string;
  source?: string;
  auth_index?: string;
  auth_type?: string;
  reasoning_effort?: string;
  endpoint?: string;
  api_key?: string;
  request_id?: string;
}

const int64 = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const parseTimestamp = (value: unknown): number => {
  if (typeof value !== 'string' || !value) return 0;
  const normalized = value.replace(/(\.\d{3})\d+/, '$1');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const maskKey = (apiKey: string): string | undefined => {
  const trimmed = apiKey.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= 4) return '***';
  if (trimmed.length < 24) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
};

const isMaskedLabel = (value: string): boolean => /^[^\s]{1,8}\*{3}[^\s]{0,4}$/.test(value);

const isEmailLabel = (value: string): boolean =>
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);

const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
};

/**
 * provider 实例身份展示脱敏。auth_type 已知为 api-key 时无条件遮蔽；旧记录仅放行
 * 合法邮箱、HTTP(S) URL、已遮蔽值和短配置名。幂等，可同时用于入库前与渲染时。
 */
export const maskInstanceLabel = (
  label: string | undefined,
  authType?: string
): string | undefined => {
  const trimmed = (label || '').trim();
  if (!trimmed) return undefined;
  if (authType?.toLowerCase() === 'api-key') return maskKey(trimmed);
  if (
    isMaskedLabel(trimmed) ||
    isEmailLabel(trimmed) ||
    isHttpUrl(trimmed) ||
    trimmed.length < 24
  ) {
    return trimmed;
  }
  return maskKey(trimmed)!;
};

const redactKnownSecrets = (value: unknown, secrets: Array<string | undefined>): string | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  let redacted = value;
  for (const secret of secrets) {
    const trimmed = secret?.trim();
    if (!trimmed || !redacted.includes(trimmed)) continue;
    redacted = redacted.split(trimmed).join('[REDACTED]');
  }
  return redacted.slice(0, 500);
};

export type ProviderInstanceIndex = Map<string, { name: string; baseUrl: string }>;

const API_KEY_CONFIG_SECTIONS = [
  'codex-api-key',
  'claude-api-key',
  'gemini-api-key',
  'xai-api-key',
  'vertex-api-key',
  'interactions-api-key',
] as const;

/**
 * 由 GET /v0/management/config 构建 auth_index / api-key → { name, baseUrl } 索引，
 * 覆盖全部 api-key 形态提供商（codex-api-key、openai-compatibility 等）。
 * 索引仅在采集时内存使用，api-key 不会随之持久化。
 */
export function buildProviderInstanceIndex(rawConfig: unknown): ProviderInstanceIndex {
  const index: ProviderInstanceIndex = new Map();
  if (typeof rawConfig !== 'object' || rawConfig === null) return index;

  const addRecord = (record: unknown, name: string, baseUrl?: unknown) => {
    if (typeof record !== 'object' || record === null) return;
    const candidateUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    const url = candidateUrl && isHttpUrl(candidateUrl) ? candidateUrl : undefined;
    if (!url) return;
    const entry = { name, baseUrl: url };
    const authIndex = (record as Record<string, unknown>)['auth-index'];
    if (typeof authIndex === 'string' && authIndex.trim()) {
      index.set(authIndex.trim(), entry);
    }
    const apiKey = (record as Record<string, unknown>)['api-key'];
    if (typeof apiKey === 'string' && apiKey.trim()) {
      index.set(apiKey.trim(), entry);
    }
  };

  const config = rawConfig as Record<string, unknown>;
  for (const section of API_KEY_CONFIG_SECTIONS) {
    const list = config[section];
    if (!Array.isArray(list)) continue;
    for (const record of list) {
      if (typeof record !== 'object' || record === null) continue;
      addRecord(record, section, (record as Record<string, unknown>)['base-url']);
    }
  }

  const compat = config['openai-compatibility'];
  if (Array.isArray(compat)) {
    for (const provider of compat) {
      if (typeof provider !== 'object' || provider === null) continue;
      const record = provider as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name : 'openai-compatibility';
      const baseUrl = record['base-url'];
      addRecord(provider, name, baseUrl);
      const entries = record['api-key-entries'];
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (typeof entry !== 'object' || entry === null) continue;
          const entryRecord = entry as Record<string, unknown>;
          const entryUrl =
            typeof entryRecord['base-url'] === 'string' ? entryRecord['base-url'] : baseUrl;
          addRecord(entry, name, entryUrl);
        }
      }
    }
  }

  return index;
}

export function parseUsageQueueRecord(
  raw: unknown,
  pricingRules: ModelPricingRule[] = [],
  providerIndex: ProviderInstanceIndex = new Map()
): UsageRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as UsageQueueRecord;

  const timestamp = parseTimestamp(record.timestamp);
  const model = (record.model || '').trim();
  if (!timestamp || !model) return null;

  const tokens = record.tokens || {};
  const inputTokens = int64(tokens.input_tokens);
  const outputTokens = int64(tokens.output_tokens);
  const reasoningTokens = int64(tokens.reasoning_tokens);
  const cacheReadTokens = int64(tokens.cache_read_tokens);
  const cacheWriteTokens = int64(tokens.cache_creation_tokens);
  const totalTokens = int64(tokens.total_tokens) || inputTokens + outputTokens;

  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
    reasoningTokens: reasoningTokens > 0 ? reasoningTokens : undefined,
    cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
    cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
    totalTokens,
  };

  const requestId = (record.request_id || '').trim();
  const failed = record.failed === true;
  const statusCode =
    int64(record.fail?.status_code) || (failed ? 500 : 200);
  const provider = (record.provider || '').trim() || 'unknown';
  const rule = matchPricingRule(model, pricingRules);

  // 实例身份：OAuth 显示凭据邮箱；api-key 实例显示中转 base-url（auth_index 或
  // api-key 精确匹配配置索引），密钥本身永不入库，仅在 URL 无法解析时显示遮蔽形态。
  const authType = (record.auth_type || '').trim().toLowerCase() || undefined;
  const authIndex = (record.auth_index || '').trim() || undefined;
  const rawSource = (record.source || '').trim() || undefined;
  const isOAuth = authType === 'oauth';
  const resolved =
    (authIndex ? providerIndex.get(authIndex) : undefined) ??
    (rawSource ? providerIndex.get(rawSource) : undefined);
  const instanceUrl = resolved?.baseUrl || undefined;
  const providerInstanceLabel = isOAuth
    ? maskInstanceLabel(rawSource, authType)
    : instanceUrl || maskInstanceLabel(rawSource, authType);
  const sourceIsSecret = Boolean(
    rawSource && maskInstanceLabel(rawSource, authType) !== rawSource
  );

  return {
    id: requestId || `${timestamp}_${Math.trunc(int64(record.latency_ms))}`,
    requestId: requestId || '--------',
    timestamp,
    model,
    // normalizedModel 只承载定价显示名；路由身份见 modelAlias/requestedModel/provider 实例字段
    normalizedModel: rule?.displayName || model,
    requestedModel: (record.original_alias || '').trim() || undefined,
    modelAlias: (record.alias || '').trim() || undefined,
    provider,
    providerInstanceId: authIndex,
    providerInstanceLabel,
    providerInstanceUrl: instanceUrl,
    providerAuthType: authType,
    reasoningEffort: (record.reasoning_effort || '').trim() || undefined,
    endpoint: (record.endpoint || '').trim(),
    httpMethod: 'POST',
    statusCode,
    latencyMs: int64(record.latency_ms),
    keyName: record.api_key ? maskKey(record.api_key) : undefined,
    sourceIp: (record.client_ip || '').trim() || undefined,
    usage,
    estimatedCostUsd: calculateUsageCost(usage, rule),
    errorMessage: failed
      ? redactKnownSecrets(record.fail?.body, [
          record.api_key,
          sourceIsSecret ? rawSource : undefined,
        ])
      : undefined,
  };
}
