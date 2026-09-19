/**
 * cap-token-usage-tracker 插件的公开聚合统计接口。
 *
 * 数据源：GET {base}/v0/resource/plugins/cap-token-usage-tracker/stats/groups
 *   ?group_by=source&range=custom&start=<ISO>&end=<ISO>（公开接口，已脱敏）
 * 返回 source×model×alias 维度的聚合行；OAuth 凭据的 source 形如
 * "Codex-<邮箱>"（插件 auth_identity.go：displayAuthProvider 与账号拼接），
 * api-key 上游的 source = base-url。额度页按 source 再聚合成每账号用量。
 */

import { USAGE_TRACKER_PLUGIN_ID } from '@/features/usage/collector/pluginBackfillCollector';

const PLUGIN_STATS_GROUPS_PATH = `/v0/resource/plugins/${USAGE_TRACKER_PLUGIN_ID}/stats/groups`;

export type TrackerStatsGroup = {
  source: string;
  authType: string;
  model: string;
  alias: string;
  requests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
};

export function resolvePluginStatsGroupsUrl(baseUrl: string): string {
  // 与 resolvePluginRequestsUrl 同样的防御：剥掉误带的 /v0/management 后缀
  const base = (baseUrl || '')
    .trim()
    .replace(/\/?v0\/management\/?$/i, '')
    .replace(/\/+$/i, '');
  if (!base) return '';
  if (!/^https?:\/\//i.test(base)) return '';
  return `${base}${PLUGIN_STATS_GROUPS_PATH}`;
}

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

export function normalizeTrackerStatsGroups(payload: unknown): TrackerStatsGroup[] {
  if (!payload || typeof payload !== 'object') return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const groups: TrackerStatsGroup[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const source = asString(record.source).trim();
    if (!source) continue;
    groups.push({
      source,
      authType: asString(record.auth_type),
      model: asString(record.model),
      alias: asString(record.alias),
      requests: asNumber(record.requests),
      failedRequests: asNumber(record.failed_requests),
      inputTokens: asNumber(record.input_tokens),
      outputTokens: asNumber(record.output_tokens),
      reasoningTokens: asNumber(record.reasoning_tokens),
      cachedTokens: asNumber(record.cached_tokens),
      totalTokens: asNumber(record.total_tokens),
    });
  }
  return groups;
}

export async function fetchTrackerStatsGroups(
  baseUrl: string,
  startMs: number,
  endMs: number
): Promise<TrackerStatsGroup[]> {
  const url = resolvePluginStatsGroupsUrl(baseUrl);
  if (!url) return [];
  const query = new URLSearchParams({
    group_by: 'source',
    range: 'custom',
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  });
  const response = await fetch(`${url}?${query.toString()}`, {
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error(`tracker stats HTTP ${response.status}`);
  }
  const payload: unknown = await response.json();
  return normalizeTrackerStatsGroups(payload);
}
