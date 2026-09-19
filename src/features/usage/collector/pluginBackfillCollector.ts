import type { UsageRecord, ModelPricingRule, TokenUsage } from '@/types/usage';
import { calculateUsageCost, matchPricingRule } from '../pricing/costEngine';
import { usageStorage } from '../storage/usageStorage';
import { buildUsageDedupKey } from './usageDedup';
import { maskInstanceLabel, type ProviderModelAliasIndex } from './logCollector';
import { computeInputSideTokens } from '../tokenSemantics';

/**
 * cap-token-usage-tracker 插件请求日志回填采集器。
 *
 * 面板明细页原先只靠浏览器轮询 usage-queue（内存队列、取出即弹出、重启清空），
 * 页面关闭/进程重启期间的记录会永久丢失。插件库（bbolt，365 天保留）持久保存了
 * 全部请求事件，本采集器在页面挂载/手动刷新/页面重新可见时，把上次同步之后的
 * 插件记录合并进本地 IndexedDB，作为对账回填；实时增量仍由 usage-queue 采集。
 *
 * 数据源：GET {base}/v0/resource/plugins/cap-token-usage-tracker/requests
 *   ?range=custom&start=<ISO>&end=<ISO>&offset=N&limit=500 （公开接口，已脱敏）
 * 字段定义见插件源码 request_log.go 的 RequestDetail。
 */

export const USAGE_TRACKER_PLUGIN_ID = 'cap-token-usage-tracker';

const PLUGIN_REQUESTS_PATH = `/v0/resource/plugins/${USAGE_TRACKER_PLUGIN_ID}/requests`;
const PLUGIN_PAGE_SIZE = 500;
/** 防失控：单次回填最多翻页数（500 × 240 = 12 万条） */
const MAX_PAGES_PER_RUN = 240;
/** 首次回填（本地无任何记录时）默认回看窗口 */
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** 单次回填最多向前追溯的跨度；更早的历史由后续触发继续向前走 */
const MAX_RUN_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
/** 光标重叠窗口：光标两侧边界事件靠 dedupKey 幂等吸收 */
const CURSOR_OVERLAP_MS = 5_000;
/** 两次回填之间的最小间隔，防止 visibilitychange 与手动刷新等触发连发 */
const MIN_RUN_INTERVAL_MS = 3_000;

/** 插件 /requests 单条记录（request_log.go RequestDetail 序列化形态） */
export interface PluginRequestItem {
  sequence?: number;
  time?: string;
  provider?: string;
  executor_type?: string;
  model?: string;
  alias?: string;
  source?: string;
  auth_type?: string;
  service_tier?: string;
  reasoning_effort?: string;
  failed?: boolean;
  failure_status?: number;
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  total_tokens?: number;
  latency_ns?: number;
  ttft_ns?: number;
  result?: string;
}

interface PluginRequestPage {
  total?: number;
  offset?: number;
  limit?: number;
  items?: PluginRequestItem[];
}

export interface PluginBackfillOptions {
  /** CPA 实例根地址（如 http://127.0.0.1:8317，不带 /v0/management） */
  baseUrl: string;
  pricingRules: ModelPricingRule[];
  /** (上游模型名, 客户端可见名) → base-url，用于把 api-key 行的官方兜底地址还原为中转 base-url */
  modelAliasIndex?: ProviderModelAliasIndex;
  /** 用户当前视图要求的最早时间（如选择 7d/30d 时的窗口起点）；undefined 表示仅按光标增量 */
  requestedStart?: number;
  /** 'all' 视图：每次触发继续向更早历史推进一个 MAX_RUN_LOOKBACK 窗口 */
  walkOlder?: boolean;
  now?: number;
}

export interface PluginBackfillResult {
  imported: number;
  skipped: number;
  pages: number;
  windowStart: number | null;
  windowEnd: number | null;
}

const int64 = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const parseIsoTimestamp = (value: unknown): number => {
  if (typeof value !== 'string' || !value) return 0;
  // 插件 time 为 UTC ISO 且带 7 位小数秒，统一截到毫秒再解析
  const normalized = value.replace(/(\.\d{3})\d+/, '$1');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function resolvePluginRequestsUrl(baseUrl: string): string {
  // 与 normalizeApiBase 同样的防御：剥掉误带的 /v0/management 后缀
  const base = (baseUrl || '')
    .trim()
    .replace(/\/?v0\/management\/?$/i, '')
    .replace(/\/+$/i, '');
  if (!base) return '';
  if (!/^https?:\/\//i.test(base)) return '';
  return `${base}${PLUGIN_REQUESTS_PATH}`;
}

/**
 * 插件请求日志记录 → UsageRecord。
 * 与 usage-queue 记录是同一事件的两个投影：本函数产出与 parseUsageQueueRecord
 * 一致的 dedupKey；插件侧没有 request_id/endpoint/client_ip/客户端密钥，
 * 对应字段留空（缺失字段在明细页显示 "—"，由 collectorSource 标识来源）。
 */
export function parsePluginRequestRecord(
  raw: unknown,
  pricingRules: ModelPricingRule[] = [],
  modelAliasIndex?: ProviderModelAliasIndex
): UsageRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as PluginRequestItem;

  const timestamp = parseIsoTimestamp(item.time);
  const model = (item.model || '').trim();
  if (!timestamp || !model) return null;

  const inputTokens = int64(item.input_tokens);
  const outputTokens = int64(item.output_tokens);
  const reasoningTokens = int64(item.reasoning_tokens);
  const cacheReadTokens = int64(item.cache_read_tokens);
  const cacheWriteTokens = int64(item.cache_creation_tokens);
  const totalTokens = int64(item.total_tokens) || inputTokens + outputTokens;
  // 与 Go Duration.Milliseconds()（向下取整）对齐，保证与 queue 记录生成同一 dedupKey
  const latencyMs = Math.max(0, Math.floor(int64(item.latency_ns) / 1e6));

  const failed = item.failed === true;
  const statusCode = int64(item.failure_status) || (failed ? 500 : 200);
  const provider = (item.provider || '').trim() || 'unknown';
  const executorType = (item.executor_type || '').trim() || undefined;
  const authType = (item.auth_type || '').trim().toLowerCase() || undefined;

  // 插件侧不带 token_breakdown，命中率分母按 provider/executor 语义现算
  //（Codex/OpenAI 系 input_tokens 已含缓存，Anthropic 系互不相交）
  const cacheTotal = cacheReadTokens + cacheWriteTokens;
  const inputSideTokens =
    cacheTotal > 0
      ? computeInputSideTokens(
          inputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          provider,
          executorType
        )
      : undefined;

  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
    reasoningTokens: reasoningTokens > 0 ? reasoningTokens : undefined,
    cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
    cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
    inputSideTokens: inputSideTokens && inputSideTokens > 0 ? inputSideTokens : undefined,
    totalTokens,
  };

  const source = (item.source || '').trim() || undefined;
  const rule = matchPricingRule(model, pricingRules);

  // 插件入库时把 api-key 上游的 source 脱敏为 provider 官方地址（如
  // https://api.openai.com/v1），OAuth 为凭据邮箱。插件记录不带 auth_index/密钥，
  // api-key 行按 (上游模型名, 客户端可见名) 反查配置索引还原真实中转 base-url，
  // 与实时采集（parseUsageQueueRecord）显示一致；反查不到时保留脱敏兜底。
  const clientModelName = (item.alias || '').trim() || model;
  const instanceUrl =
    authType === 'apikey' && modelAliasIndex
      ? modelAliasIndex.get(`${model}::${clientModelName}`)
      : undefined;
  const providerInstanceLabel =
    instanceUrl || maskInstanceLabel(source, authType);

  return {
    // 无 request_id：以 dedupKey 为幂等主键，重复回填 put 原地覆盖
    id: buildUsageDedupKey(timestamp, model, totalTokens, latencyMs),
    requestId: '--------',
    timestamp,
    model,
    normalizedModel: rule?.displayName || model,
    modelAlias: (item.alias || '').trim() || undefined,
    provider,
    executorType,
    providerInstanceLabel,
    providerInstanceUrl: instanceUrl,
    providerAuthType: authType,
    reasoningEffort: (item.reasoning_effort || '').trim() || undefined,
    endpoint: '',
    httpMethod: 'POST',
    statusCode,
    latencyMs,
    usage,
    estimatedCostUsd: calculateUsageCost(usage, rule),
    dedupKey: buildUsageDedupKey(timestamp, model, totalTokens, latencyMs),
    collectorSource: 'plugin-backfill',
    errorMessage: failed ? (item.result || '').trim() || '失败' : undefined,
  };
}

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) {
      throw new Error(`plugin requests endpoint HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const isPluginPage = (value: unknown): value is PluginRequestPage =>
  typeof value === 'object' && value !== null && Array.isArray((value as PluginRequestPage).items);

export const isPluginBackfillAvailable = (baseUrl: string): boolean =>
  Boolean(resolvePluginRequestsUrl(baseUrl));

/**
 * 执行一次插件库回填。内部管理同步光标（存于 IndexedDB sync_meta）：
 * - 常规增量轮：[lastSyncedAt-重叠窗口, now]；首次（本地无记录）回看
 *   DEFAULT_LOOKBACK_MS；本地有旧记录但从未同步过则从最新记录之后开始，
 *   避免与旧数据（无 dedupKey）重叠。
 * - 深挖轮：requestedStart 早于已覆盖范围、或 walkOlder（'all' 视图）时，
 *   把窗口起点向更早历史推进，单次最多 MAX_RUN_LOOKBACK_MS，更早的部分
 *   由后续触发继续走。
 * 光标只在整轮成功后前进；单页失败立即中止，下次触发重试同一窗口。
 */
export async function collectPluginBackfill(
  options: PluginBackfillOptions
): Promise<PluginBackfillResult> {
  const url = resolvePluginRequestsUrl(options.baseUrl);
  const result: PluginBackfillResult = {
    imported: 0,
    skipped: 0,
    pages: 0,
    windowStart: null,
    windowEnd: null,
  };
  if (!url) return result;

  const now = options.now ?? Date.now();
  const meta = await usageStorage.getSyncMeta();
  if (meta.lastRunAt && now - meta.lastRunAt < MIN_RUN_INTERVAL_MS) {
    return result;
  }

  let end = now;
  let start: number;

  const incrementalStart = meta.lastSyncedAt
    ? meta.lastSyncedAt - CURSOR_OVERLAP_MS
    : null;
  let deepStart: number | null = null;
  if (
    options.requestedStart != null &&
    (meta.oldestCoveredAt == null || options.requestedStart < meta.oldestCoveredAt)
  ) {
    deepStart = options.requestedStart;
  }
  if (options.walkOlder && meta.oldestCoveredAt != null && !meta.historyExhausted) {
    const older = meta.oldestCoveredAt - MAX_RUN_LOOKBACK_MS;
    deepStart = deepStart == null ? older : Math.min(deepStart, older);
  }
  const isDeepRun = deepStart != null && (incrementalStart == null || deepStart < incrementalStart);

  if (isDeepRun) {
    start = deepStart as number;
    if (end - start > MAX_RUN_LOOKBACK_MS) {
      // 单次吃不下：先补最老的一段；增量部分光标不动，留待常规轮
      end = start + MAX_RUN_LOOKBACK_MS;
    }
  } else if (incrementalStart != null) {
    start = incrementalStart;
    if (end - start > MAX_RUN_LOOKBACK_MS) {
      start = end - MAX_RUN_LOOKBACK_MS;
    }
  } else {
    const newest = await usageStorage.getNewestRecordTimestamp();
    start = newest != null ? newest + 1 : now - DEFAULT_LOOKBACK_MS;
    if (end - start > MAX_RUN_LOOKBACK_MS) {
      start = end - MAX_RUN_LOOKBACK_MS;
    }
  }

  if (end - start < CURSOR_OVERLAP_MS) {
    await usageStorage.setSyncMeta({ ...meta, lastRunAt: now });
    return result;
  }

  result.windowStart = start;
  result.windowEnd = end;

  let offset = 0;
  for (let page = 0; page < MAX_PAGES_PER_RUN; page += 1) {
    const query = new URLSearchParams({
      range: 'custom',
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      offset: String(offset),
      limit: String(PLUGIN_PAGE_SIZE),
    });
    let payload: unknown;
    try {
      payload = await fetchWithTimeout(`${url}?${query.toString()}`, 20_000);
    } catch {
      // 网络失败/插件不在：保留光标不动，下次触发重试
      return result;
    }
    if (!isPluginPage(payload)) return result;

    const items = payload.items || [];
    const parsed = items
      .map((item) =>
        parsePluginRequestRecord(item, options.pricingRules, options.modelAliasIndex)
      )
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const plan = await usageStorage.saveRecordsDeduped(parsed);
    result.imported += plan.toWrite.length;
    result.skipped += plan.skipped;
    result.pages += 1;

    if (items.length < PLUGIN_PAGE_SIZE) break;
    offset += items.length;
    if (payload.total != null && offset >= payload.total) break;
  }

  const oldestCoveredAt = meta.oldestCoveredAt
    ? Math.min(meta.oldestCoveredAt, start)
    : start;
  // 深挖轮颗粒无收说明插件里已没有更早数据，停止后续触发继续向历史空走
  const historyExhausted =
    meta.historyExhausted || (isDeepRun && oldestCoveredAt === start && result.imported === 0);
  await usageStorage.setSyncMeta({
    lastSyncedAt: Math.max(meta.lastSyncedAt ?? 0, end),
    oldestCoveredAt,
    lastRunAt: now,
    historyExhausted,
  });
  return result;
}
