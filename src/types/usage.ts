export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens: number;
}

export interface UsageRecord {
  id: string;
  requestId: string;
  timestamp: number;
  /** 实际发送给上游的模型 */
  model: string;
  /** 定价规则显示名（仅用于费用展示，不代表路由身份） */
  normalizedModel: string;
  /** 客户端请求的原始模型/alias */
  requestedModel?: string;
  /** 最终选中 provider 模型项的 alias */
  modelAlias?: string;
  provider: string;
  /** 最终选中 provider 实例的稳定非秘密 ID（后端 auth_index） */
  providerInstanceId?: string;
  /** 实例身份展示值：OAuth 为凭据邮箱，api-key 实例为中转 base-url（密钥永不入库） */
  providerInstanceLabel?: string;
  /** api-key 实例对应的 base-url（由 auth_index 或 api-key 从 provider 配置解析） */
  providerInstanceUrl?: string;
  /** 认证方式（后端 auth_type：oauth / api-key） */
  providerAuthType?: string;
  /** 推力强度（reasoning effort，如 medium/high/xhigh/max） */
  reasoningEffort?: string;
  endpoint: string;
  httpMethod: string;
  statusCode: number;
  latencyMs: number;
  keyName?: string;
  sourceIp?: string;
  usage: TokenUsage;
  estimatedCostUsd: number;
  errorMessage?: string;
}

export type UsageTimeRange = 'today' | '24h' | '7d' | '30d' | 'all';

export interface TimeRangeFilter {
  range: UsageTimeRange;
  startTime?: number;
  endTime?: number;
}

export interface UsageFilterParams {
  timeRange: TimeRangeFilter;
  model?: string;
  provider?: string;
  statusCodeGroup?: 'all' | '2xx' | '3xx' | '4xx' | '5xx';
  keyName?: string;
  searchQuery?: string;
}

export interface ModelPricingRule {
  modelPattern: string;
  displayName: string;
  provider: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  reasoningPricePerMillion?: number;
  cacheReadPricePerMillion?: number;
  cacheWritePricePerMillion?: number;
  isCustom?: boolean;
  updatedAt?: number;
}

export interface HourlyTrendBucket {
  hourTimestamp: number;
  hourLabel: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
}

export interface UsageKpiSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheHitRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  rpm: number;
  tps: number;
  totalCostUsd: number;
  avgCostPerRequestUsd: number;
  pricedRequestsCount: number;
}

export interface RankItem {
  id: string;
  label: string;
  count: number;
  tokens: number;
  costUsd: number;
  percentage: number;
}

export interface HourlyDistributionItem {
  hour: number;
  label: string;
  requestCount: number;
  percentage: number;
  tokenCount: number;
}
