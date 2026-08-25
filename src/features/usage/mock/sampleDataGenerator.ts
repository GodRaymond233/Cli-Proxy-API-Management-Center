import type { UsageRecord, TokenUsage } from '@/types/usage';
import { DEFAULT_PRICING_RULES } from '../pricing/defaultPricing';
import { calculateUsageCost, matchPricingRule } from '../pricing/costEngine';

interface ModelSpec {
  model: string;
  provider: string;
  weight: number;
  avgInput: number;
  avgOutput: number;
  hasReasoning: boolean;
  hasCache: boolean;
}

const SAMPLE_MODELS: ModelSpec[] = [
  {
    model: 'gpt-5.6-sol-Pro',
    provider: 'codex',
    weight: 45,
    avgInput: 110000,
    avgOutput: 700,
    hasReasoning: true,
    hasCache: true,
  },
  {
    model: 'codex-auto-review',
    provider: 'codex',
    weight: 25,
    avgInput: 45000,
    avgOutput: 180,
    hasReasoning: true,
    hasCache: true,
  },
  {
    model: 'claude-3-7-sonnet-20250219',
    provider: 'anthropic',
    weight: 15,
    avgInput: 35000,
    avgOutput: 1200,
    hasReasoning: true,
    hasCache: true,
  },
  {
    model: 'gpt-5.6-terra',
    provider: 'openai',
    weight: 8,
    avgInput: 25000,
    avgOutput: 450,
    hasReasoning: false,
    hasCache: false,
  },
  {
    model: 'deepseek-reasoner',
    provider: 'deepseek',
    weight: 7,
    avgInput: 18000,
    avgOutput: 1600,
    hasReasoning: true,
    hasCache: false,
  },
];

const SOURCES = ['摸鱼站Pro分组', 'godraymond233@gmai...', 'VSCode-Claude-Ext', 'Cursor-IDE', 'Terminal-CLI'];
const KEYS = ['cpa-••••0849', 'cpa-••••3321', 'cpa-••••9912'];

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function generateHex(length: number): string {
  let res = '';
  const hex = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    res += hex[Math.floor(Math.random() * 16)];
  }
  return res;
}

export function generateSampleUsageRecords(count = 350): UsageRecord[] {
  const records: UsageRecord[] = [];
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // Distribute timestamps more heavily in recent 24-48 hours
    const power = Math.random() ** 1.8;
    const timestamp = Math.floor(sevenDaysAgo + power * (now - sevenDaysAgo));

    // Weighted model pick
    const rand = Math.random() * 100;
    let accumulated = 0;
    let spec = SAMPLE_MODELS[0];
    for (const m of SAMPLE_MODELS) {
      accumulated += m.weight;
      if (rand <= accumulated) {
        spec = m;
        break;
      }
    }

    // Input & Output variation
    const inputRatio = 0.7 + Math.random() * 0.6;
    const outputRatio = 0.5 + Math.random() * 1.0;
    const inputTokens = Math.round(spec.avgInput * inputRatio);
    const outputTokens = Math.round(spec.avgOutput * outputRatio);

    // Cache hit
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    if (spec.hasCache && Math.random() < 0.85) {
      cacheReadTokens = Math.round(inputTokens * (0.8 + Math.random() * 0.18));
      if (Math.random() < 0.1) {
        cacheWriteTokens = Math.round(inputTokens * 0.2);
      }
    }

    // Reasoning tokens
    let reasoningTokens = 0;
    if (spec.hasReasoning && Math.random() < 0.7) {
      reasoningTokens = Math.round(outputTokens * (0.2 + Math.random() * 0.45));
    }

    const totalTokens = inputTokens + outputTokens;

    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      reasoningTokens: reasoningTokens > 0 ? reasoningTokens : undefined,
      cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
      cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
      totalTokens,
    };

    // Latency
    const baseLatency = (outputTokens / 45) * 1000 + (inputTokens > 50000 ? 800 : 200);
    const latencyMs = Math.round(baseLatency * (0.8 + Math.random() * 0.5));

    // Status code (99.2% 200, 0.5% 429, 0.3% 500)
    let statusCode = 200;
    const errRand = Math.random();
    if (errRand > 0.995) statusCode = 500;
    else if (errRand > 0.99) statusCode = 429;

    const rule = matchPricingRule(spec.model, DEFAULT_PRICING_RULES);
    const estimatedCostUsd = calculateUsageCost(usage, rule);

    const requestId = generateHex(8);
    records.push({
      id: `sample_${requestId}_${timestamp}`,
      requestId,
      timestamp,
      model: spec.model,
      normalizedModel: rule?.displayName || spec.model,
      provider: spec.provider,
      endpoint: spec.provider === 'anthropic' ? '/v1/messages?beta=true' : '/v1/chat/completions',
      httpMethod: 'POST',
      statusCode,
      latencyMs,
      sourceIp: '127.0.0.1',
      keyName: pickRandom(KEYS),
      usage,
      estimatedCostUsd,
      errorMessage: statusCode === 500 ? 'Internal Server Error: upstream provider overloaded' : statusCode === 429 ? 'Rate limit exceeded' : undefined,
    });
  }

  records.sort((a, b) => b.timestamp - a.timestamp);
  return records;
}
