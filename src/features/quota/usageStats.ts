/**
 * 额度页账号用量统计：tracker 插件聚合行 → 每账号汇总 + 认证凭证 ↔ source 映射。
 * React-free / SCSS-free —— 由 tests/quotaUsageStats.test.ts 直接消费。
 */

import type { AuthFileItem } from '@/types';
import type { TrackerStatsGroup } from '@/services/api/trackerStats';
import type { QuotaProviderType } from './providers/types';

export type AccountUsageSummary = {
  source: string;
  requests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
};

/**
 * tracker 侧 OAuth source 形如 "Codex-<邮箱>"（auth_identity.go：
 * displayAuthProvider('codex') = 'Codex'，与账号邮箱拼接）。凭证侧用
 * AuthFileItem.email（后端从 auth JSON 的 email 字段下发），不做文件名解析。
 * 目前只映射 codex；其他 provider 的 source 前缀未实证，留 null 不显示。
 */
export function trackerSourceForAuthFile(
  type: QuotaProviderType,
  file: Pick<AuthFileItem, 'email'>
): string | null {
  if (type !== 'codex') return null;
  const email = (file.email || '').trim();
  if (!email) return null;
  return `Codex-${email}`;
}

export function aggregateUsageBySource(
  groups: TrackerStatsGroup[]
): Map<string, AccountUsageSummary> {
  const bySource = new Map<string, AccountUsageSummary>();
  for (const group of groups) {
    const existing = bySource.get(group.source);
    if (existing) {
      existing.requests += group.requests;
      existing.failedRequests += group.failedRequests;
      existing.inputTokens += group.inputTokens;
      existing.outputTokens += group.outputTokens;
      existing.reasoningTokens += group.reasoningTokens;
      existing.cachedTokens += group.cachedTokens;
      existing.totalTokens += group.totalTokens;
    } else {
      bySource.set(group.source, {
        source: group.source,
        requests: group.requests,
        failedRequests: group.failedRequests,
        inputTokens: group.inputTokens,
        outputTokens: group.outputTokens,
        reasoningTokens: group.reasoningTokens,
        cachedTokens: group.cachedTokens,
        totalTokens: group.totalTokens,
      });
    }
  }
  return bySource;
}

export function usageForAuthFile(
  type: QuotaProviderType,
  file: Pick<AuthFileItem, 'email'>,
  statsBySource: Map<string, AccountUsageSummary>
): AccountUsageSummary | null {
  const source = trackerSourceForAuthFile(type, file);
  if (!source) return null;
  return statsBySource.get(source) ?? null;
}
