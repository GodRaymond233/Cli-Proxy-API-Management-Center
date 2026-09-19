import type { UsageRecord } from '@/types/usage';

/**
 * usage-queue 实时采集与插件库回填是两条独立通道，会收到同一个请求事件。
 * 事件规范去重键：时间秒 + 上游模型 + 总 token + 延迟毫秒。
 * latency 必须与后端口径一致：queue 的 latency_ms 与 plugin 的 latency_ns/1e6
 * 都来自同一个 coreusage Record.Latency，Go Duration.Milliseconds() 向下取整，
 * 因此插件侧用 Math.floor(ns/1e6) 对齐。
 */
export const buildUsageDedupKey = (
  timestampMs: number,
  model: string,
  totalTokens: number,
  latencyMs: number
): string =>
  `ev:${Math.floor(timestampMs / 1000)}:${model}:${totalTokens}:${Math.max(
    0,
    Math.trunc(latencyMs)
  )}`;

export interface DedupCandidateMeta {
  dedupKey?: string;
  collectorSource?: UsageRecord['collectorSource'];
}

export interface DedupWritePlan {
  /** 需要写入 IndexedDB 的记录（可能复用已存记录的 id 以保持键稳定） */
  toWrite: UsageRecord[];
  /** 已存在且无需写入的数量 */
  skipped: number;
}

/**
 * 决定一批记录中哪些真正需要落库：
 * - 键冲突时以 usage-queue 记录为准（含 request_id/endpoint/client_ip，信息最全）；
 *   若已存的是 plugin-backfill、新来的是 usage-queue，则用新记录内容覆盖，但保留
 *   原 id（IndexedDB keyPath='id'，保 id 才能原地更新而不是插重复行）。
 * - 同批内重复键同样按该优先级收敛。
 * - 无 dedupKey 的旧记录无法参与去重，原样写入（由调用方游标保证不重叠）。
 */
export function planDedupedWrites(
  records: UsageRecord[],
  existing: Map<string, { id: string; collectorSource?: UsageRecord['collectorSource'] }>
): DedupWritePlan {
  const batchByKey = new Map<string, UsageRecord>();
  for (const record of records) {
    if (!record.dedupKey) {
      batchByKey.set(`__nodedup__${record.id}`, record);
      continue;
    }
    const current = batchByKey.get(record.dedupKey);
    if (!current || current.collectorSource !== 'usage-queue') {
      batchByKey.set(record.dedupKey, record);
    }
  }

  const toWrite: UsageRecord[] = [];
  let skipped = 0;
  for (const [key, record] of batchByKey) {
    if (key.startsWith('__nodedup__')) {
      toWrite.push(record);
      continue;
    }
    const found = existing.get(key);
    if (!found) {
      toWrite.push(record);
      continue;
    }
    if (record.collectorSource === 'usage-queue' && found.collectorSource !== 'usage-queue') {
      toWrite.push({ ...record, id: found.id });
      continue;
    }
    skipped += 1;
  }
  return { toWrite, skipped };
}
