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
  model: string;
  normalizedModel: string;
  provider: string;
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
