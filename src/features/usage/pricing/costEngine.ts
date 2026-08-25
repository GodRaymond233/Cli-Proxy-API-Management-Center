import type { ModelPricingRule, TokenUsage } from '@/types/usage';
import { DEFAULT_PRICING_RULES } from './defaultPricing';

function matchesPattern(text: string, pattern: string): boolean {
  const normalizedText = text.trim().toLowerCase();
  const normalizedPattern = pattern.trim().toLowerCase();

  if (normalizedPattern === normalizedText) return true;

  if (normalizedPattern.endsWith('*')) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedText.startsWith(prefix);
  }

  if (normalizedPattern.startsWith('*')) {
    const suffix = normalizedPattern.slice(1);
    return normalizedText.endsWith(suffix);
  }

  return false;
}

export function matchPricingRule(
  modelName: string,
  customRules: ModelPricingRule[] = [],
  defaultRules: ModelPricingRule[] = DEFAULT_PRICING_RULES
): ModelPricingRule | null {
  if (!modelName) return null;

  const normalized = modelName.trim().toLowerCase();

  // 1. Check user custom rules first
  for (const rule of customRules) {
    if (matchesPattern(normalized, rule.modelPattern)) {
      return rule;
    }
  }

  // 2. Check default built-in presets
  for (const rule of defaultRules) {
    if (matchesPattern(normalized, rule.modelPattern)) {
      return rule;
    }
  }

  return null;
}

export function calculateUsageCost(
  usage: TokenUsage,
  rule: ModelPricingRule | null
): number {
  if (!rule) return 0;

  const inputPrice = rule.inputPricePerMillion / 1_000_000;
  const outputPrice = rule.outputPricePerMillion / 1_000_000;
  const reasoningPrice =
    (rule.reasoningPricePerMillion ?? rule.outputPricePerMillion) / 1_000_000;
  const cacheReadPrice =
    (rule.cacheReadPricePerMillion ?? rule.inputPricePerMillion * 0.1) / 1_000_000;
  const cacheWritePrice =
    (rule.cacheWritePricePerMillion ?? rule.inputPricePerMillion * 1.25) / 1_000_000;

  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const reasoningTokens = usage.reasoningTokens ?? 0;

  const baseInputTokens = Math.max(0, usage.inputTokens - cacheReadTokens);
  const baseOutputTokens = Math.max(0, usage.outputTokens - reasoningTokens);

  const cost =
    baseInputTokens * inputPrice +
    cacheReadTokens * cacheReadPrice +
    cacheWriteTokens * cacheWritePrice +
    baseOutputTokens * outputPrice +
    reasoningTokens * reasoningPrice;

  return Math.max(0, cost);
}
