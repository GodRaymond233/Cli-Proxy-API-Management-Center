import { describe, expect, test } from 'bun:test';
import {
  aggregateUsageBySource,
  trackerSourceForAuthFile,
  usageForAuthFile,
} from '@/features/quota/usageStats';
import {
  normalizeTrackerStatsGroups,
  type TrackerStatsGroup,
} from '@/services/api/trackerStats';

const group = (overrides: Partial<TrackerStatsGroup>): TrackerStatsGroup => ({
  source: 'Codex-godraymond233@gmail.com',
  authType: 'oauth',
  model: 'gpt-6-astra',
  alias: 'gpt-6-astra',
  requests: 10,
  failedRequests: 0,
  inputTokens: 1000,
  outputTokens: 200,
  reasoningTokens: 50,
  cachedTokens: 800,
  totalTokens: 1250,
  ...overrides,
});

describe('trackerSourceForAuthFile', () => {
  test('codex 凭证按 email 字段映射为插件 source 形态 Codex-<邮箱>', () => {
    expect(
      trackerSourceForAuthFile('codex', { email: 'godraymond233@gmail.com' })
    ).toBe('Codex-godraymond233@gmail.com');
    // 后端下发的 email 可能带空白，trim 后使用
    expect(
      trackerSourceForAuthFile('codex', { email: ' qingxianhuage@gmail.com ' })
    ).toBe('Codex-qingxianhuage@gmail.com');
  });

  test('非 codex provider 暂无映射（source 前缀未实证）', () => {
    expect(trackerSourceForAuthFile('claude', { email: 'user@gmail.com' })).toBeNull();
  });

  test('email 缺失时返回 null，不做文件名猜测', () => {
    expect(trackerSourceForAuthFile('codex', {})).toBeNull();
    expect(trackerSourceForAuthFile('codex', { email: '' })).toBeNull();
  });
});

describe('aggregateUsageBySource', () => {
  test('同一 source 的多模型行累加，不同 source 各自成组', () => {
    const bySource = aggregateUsageBySource([
      group({ model: 'gpt-6-astra', requests: 10, totalTokens: 1250, cachedTokens: 800 }),
      group({
        model: 'gpt-5.6-sol',
        requests: 3,
        failedRequests: 1,
        totalTokens: 750,
        cachedTokens: 100,
      }),
      group({ source: 'https://long.moyuu.cc/v1', authType: 'apikey', requests: 72 }),
    ]);
    expect(bySource.size).toBe(2);
    const raymond = bySource.get('Codex-godraymond233@gmail.com');
    expect(raymond).toBeDefined();
    expect(raymond?.requests).toBe(13);
    expect(raymond?.failedRequests).toBe(1);
    expect(raymond?.totalTokens).toBe(2000);
    expect(raymond?.cachedTokens).toBe(900);
    expect(bySource.get('https://long.moyuu.cc/v1')?.requests).toBe(72);
  });

  test('空输入返回空 Map', () => {
    expect(aggregateUsageBySource([]).size).toBe(0);
  });
});

describe('usageForAuthFile', () => {
  const stats = aggregateUsageBySource([group({ requests: 5 })]);

  test('命中映射返回该账号汇总', () => {
    const usage = usageForAuthFile('codex', { email: 'godraymond233@gmail.com' }, stats);
    expect(usage?.requests).toBe(5);
  });

  test('窗口内无请求（source 不在聚合里）返回 null', () => {
    expect(usageForAuthFile('codex', { email: 'qingxianhuage@gmail.com' }, stats)).toBeNull();
  });
});

describe('normalizeTrackerStatsGroups', () => {
  test('丢弃无 source 的行，缺失数值字段按 0 处理', () => {
    const groups = normalizeTrackerStatsGroups({
      items: [
        { source: 'Codex-a@b.com', requests: 2, total_tokens: 30 },
        { model: 'no-source-row' },
        null,
        'not-an-object',
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].source).toBe('Codex-a@b.com');
    expect(groups[0].requests).toBe(2);
    expect(groups[0].totalTokens).toBe(30);
    expect(groups[0].cachedTokens).toBe(0);
  });

  test('非对象 payload 与缺 items 返回空数组', () => {
    expect(normalizeTrackerStatsGroups(null)).toEqual([]);
    expect(normalizeTrackerStatsGroups({})).toEqual([]);
    expect(normalizeTrackerStatsGroups({ items: 'oops' })).toEqual([]);
  });
});
