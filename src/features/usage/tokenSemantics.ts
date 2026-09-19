import type { UsageRecord } from '@/types/usage';

/**
 * 缓存命中率分母的语义判定。
 *
 * 各上游对 input_tokens 是否含缓存口径不一：
 * - OpenAI/Codex/Gemini 等（subset）：input_tokens 已包含缓存读/写，
 *   命中率 = cacheRead ÷ input_tokens（宿主 accounting.go 的 subset/separateReasoning）。
 * - Anthropic（independent）：input_tokens 只算未命中部分，
 *   命中率 = cacheRead ÷ (input + cacheRead + cacheWrite)。
 * 旧代码对全部记录一律按 independent 相加，Codex 行分母把缓存算了两遍，
 * 高命中行显示被腰斩（如 211,968/215,070 显示 49.6%，实际 98.6%）。
 *
 * provider/executor 标记清单须与宿主 sdk/cliproxy/usage/accounting.go 的
 * tokenAccountingSemanticsFor 保持同步。
 */

type TokenSemantics = 'independent' | 'subset' | 'unknown';

const SUBSET_PROVIDER_MARKERS = [
  'openai',
  'codex',
  'xai',
  'grok',
  'kimi',
  'qwen',
  'deepseek',
  'openrouter',
  // separateReasoning 语义（gemini 系）缓存同样计入 input 总量，对命中率等同 subset
  'gemini',
  'aistudio',
  'antigravity',
  'vertex',
  'interaction',
];

export function classifyTokenSemantics(
  provider?: string,
  executorType?: string
): TokenSemantics {
  const normalizedProvider = (provider || '').trim().toLowerCase();
  const normalizedExecutor = (executorType || '').trim().toLowerCase();
  const value = `${normalizedProvider} ${normalizedExecutor}`.trim();
  if (!value || value === 'unknown' || value === 'unknown unknown') return 'unknown';
  if (
    normalizedExecutor === 'openaicompatexecutor' ||
    normalizedProvider === 'openai-compatibility' ||
    normalizedProvider.startsWith('openai-compatible-')
  ) {
    return 'subset';
  }
  if (value.includes('claude') || value.includes('anthropic')) return 'independent';
  if (SUBSET_PROVIDER_MARKERS.some((marker) => value.includes(marker))) return 'subset';
  return 'unknown';
}

/**
 * 输入侧 token 总量（未命中 input + 缓存读 + 缓存写），作为命中率分母。
 * unknown 时按数据自检：缓存大于 input 则必为 independent，否则按 subset。
 */
export function computeInputSideTokens(
  inputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
  provider?: string,
  executorType?: string
): number {
  const input = Math.max(0, inputTokens);
  const cacheTotal = Math.max(0, cacheReadTokens) + Math.max(0, cacheWriteTokens);
  const semantics = classifyTokenSemantics(provider, executorType);
  if (semantics === 'independent') return input + cacheTotal;
  if (semantics === 'subset') return Math.max(input, cacheTotal);
  return cacheTotal > input ? input + cacheTotal : Math.max(input, cacheTotal);
}

/**
 * 单条记录的输入侧分母。采集时已解析 token_breakdown（usage-queue）或按语义
 * 算好（插件回填）的记录直接用 inputSideTokens；IndexedDB 旧记录无该字段，
 * 退回按 provider 现算。
 */
export function resolveRecordInputSideTokens(record: UsageRecord): number {
  const stored = record.usage.inputSideTokens ?? 0;
  if (stored > 0) return stored;
  return computeInputSideTokens(
    record.usage.inputTokens,
    record.usage.cacheReadTokens ?? 0,
    record.usage.cacheWriteTokens ?? 0,
    record.provider,
    record.executorType
  );
}

/** 单条记录缓存命中率（0~100），分母非法时返回 0（界面显示 "—"）。 */
export function resolveRecordCacheHitRate(record: UsageRecord): number {
  const denominator = resolveRecordInputSideTokens(record);
  if (denominator <= 0) return 0;
  return ((record.usage.cacheReadTokens ?? 0) / denominator) * 100;
}
