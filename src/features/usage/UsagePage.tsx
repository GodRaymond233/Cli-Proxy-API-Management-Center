import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { UsageTimeRange, UsageFilterParams } from '@/types/usage';
import { useUsageRecords } from './hooks/useUsageRecords';
import { useUsageAnalytics } from './hooks/useUsageAnalytics';
import { UsageTimeRangePicker } from './components/common/UsageTimeRangePicker';
import { UsageOverviewTab } from './components/overview/UsageOverviewTab';
import { UsageAnalyticsTab } from './components/analytics/UsageAnalyticsTab';
import { UsageRequestsTab } from './components/requests/UsageRequestsTab';
import { UsagePricingTab } from './components/pricing/UsagePricingTab';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw, IconTimer, IconTrash2 } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useRevealGroup } from '@/hooks/motion';
import { logsApi } from '@/services/api/logs';
import { apiClient } from '@/services/api/client';
import {
  parseUsageQueueRecord,
  buildProviderInstanceIndex,
  buildProviderModelAliasIndex,
  type ProviderInstanceIndex,
  type ProviderModelAliasIndex,
} from './collector/logCollector';
import { collectPluginBackfill } from './collector/pluginBackfillCollector';
import { usageStorage } from './storage/usageStorage';
import { usePricingStore } from './hooks/usePricingStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { normalizeApiBase } from '@/utils/connection';
import styles from './UsagePage.module.scss';

type ActiveTab = 'overview' | 'analytics' | 'requests' | 'pricing';

// auth_index / api-key → { name, baseUrl }：把 api-key 实例显示为中转 URL 而非密钥。
// (上游模型名, 客户端可见名) → baseUrl：插件回填行 api-key source 的反查索引。
// 60s 缓存，避免随 15s 采集周期反复请求配置。
const PROVIDER_INDEX_TTL_MS = 60_000;
let providerIndexCache: {
  at: number;
  instanceIndex: ProviderInstanceIndex;
  modelAliasIndex: ProviderModelAliasIndex;
} | null = null;

async function getProviderIndexes(): Promise<{
  instanceIndex: ProviderInstanceIndex;
  modelAliasIndex: ProviderModelAliasIndex;
}> {
  if (providerIndexCache && Date.now() - providerIndexCache.at < PROVIDER_INDEX_TTL_MS) {
    return {
      instanceIndex: providerIndexCache.instanceIndex,
      modelAliasIndex: providerIndexCache.modelAliasIndex,
    };
  }
  let instanceIndex: ProviderInstanceIndex = new Map();
  let modelAliasIndex: ProviderModelAliasIndex = new Map();
  try {
    const rawConfig = await apiClient.get('/config');
    instanceIndex = buildProviderInstanceIndex(rawConfig);
    modelAliasIndex = buildProviderModelAliasIndex(rawConfig);
  } catch {
    // 配置不可用时退化为遮蔽形态，不阻塞采集
  }
  providerIndexCache = { at: Date.now(), instanceIndex, modelAliasIndex };
  return { instanceIndex, modelAliasIndex };
}

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'overview', label: '总览' },
  { key: 'analytics', label: '分析' },
  { key: 'requests', label: '请求明细' },
  { key: 'pricing', label: '价格统计' },
];

export function UsagePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [timeRange, setTimeRange] = useState<UsageTimeRange>('24h');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const getAllRules = usePricingStore((state) => state.getAllRules);
  const authApiBase = useAuthStore((state) => state.apiBase);

  // 切换页签时重放入场级联（容器随 key 重挂载）
  const revealRef = useRevealGroup<HTMLDivElement>();

  const filterParams: UsageFilterParams = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- 时间窗口需要以计算时刻为准
    const now = Date.now();
    let startTime: number | undefined;
    if (timeRange === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      startTime = today.getTime();
    } else if (timeRange === '24h') {
      startTime = now - 24 * 60 * 60 * 1000;
    } else if (timeRange === '7d') {
      startTime = now - 7 * 24 * 60 * 60 * 1000;
    } else if (timeRange === '30d') {
      startTime = now - 30 * 24 * 60 * 60 * 1000;
    }

    return {
      timeRange: {
        range: timeRange,
        startTime,
        // endTime 留空：窗口在查询时评估，否则挂载时刻之后完成的请求永远落在范围外
      },
    };
  }, [timeRange]);

  const { records, totalCount, refetch, clearRecords } = useUsageRecords(
    filterParams,
    autoRefresh
  );
  const analytics = useUsageAnalytics(records, filterParams.timeRange.startTime);

  // Usage queue collector: pops finished-request usage records from CPA
  const collectUsageQueue = useCallback(async () => {
    try {
      const [raw, { instanceIndex }] = await Promise.all([
        logsApi.fetchUsageQueue(200),
        getProviderIndexes(),
      ]);
      if (!Array.isArray(raw) || raw.length === 0) return;
      const rules = getAllRules();
      const parsedRecords = raw
        .map((item) => parseUsageQueueRecord(item, rules, instanceIndex))
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (parsedRecords.length > 0) {
        await usageStorage.saveRecords(parsedRecords);
      }
    } catch {
      // Ignored in background
    }
  }, [getAllRules]);

  // 插件库回填采集器：页面关闭/进程重启期间 usage-queue 丢失的记录，
  // 从插件持久化库（365 天）对账补齐。挂载、手动刷新、页面重新可见时触发。
  const collectBackfill = useCallback(async () => {
    try {
      const { modelAliasIndex } = await getProviderIndexes();
      await collectPluginBackfill({
        baseUrl: normalizeApiBase(authApiBase),
        pricingRules: getAllRules(),
        modelAliasIndex,
        requestedStart: filterParams.timeRange.startTime,
        walkOlder: timeRange === 'all',
      });
    } catch {
      // 回填失败不阻塞实时采集，光标未前进，下次触发重试
    }
  }, [authApiBase, getAllRules, filterParams.timeRange.startTime, timeRange]);

  // 所有入口共享同一刷新任务，避免并发弹出队列或重复查询 IndexedDB。
  const handleRefresh = useCallback((): Promise<void> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const pending = (async () => {
      await collectUsageQueue();
      await refetch();
      await collectBackfill();
      await refetch();
    })().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = pending;
    return pending;
  }, [collectUsageQueue, collectBackfill, refetch]);

  useHeaderRefresh(handleRefresh);

  // Usage queue collector: pops finished-request usage records from CPA
  useEffect(() => {
    void handleRefresh();
    const interval = setInterval(() => void handleRefresh(), 15000);
    return () => clearInterval(interval);
  }, [handleRefresh]);

  // 标签页从后台/睡眠恢复时补一次采集，找回睡着期间漏收的记录
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void handleRefresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [handleRefresh]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>使用明细</h1>

      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tabItem} ${activeTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <UsageTimeRangePicker value={timeRange} onChange={setTimeRange} />

        <div className={styles.toolbarRight}>
          <span className={styles.liveStatus} title="本地日志采集进行中">
            <span className={styles.greenDot} />
            {totalCount.toLocaleString()} 条长期记录
          </span>
          <Button size="sm" variant="secondary" onClick={() => void handleRefresh()} title="刷新数据">
            <span className={styles.buttonContent}>
              <IconRefreshCw size={16} />
              刷新
            </span>
          </Button>
          <ToggleSwitch
            checked={autoRefresh}
            onChange={(value) => setAutoRefresh(value)}
            label={
              <span className={styles.switchLabel}>
                <IconTimer size={16} />
                自动刷新
              </span>
            }
          />
          <Button size="sm" variant="danger" onClick={clearRecords} title="清空记录">
            <span className={styles.buttonContent}>
              <IconTrash2 size={16} />
              清空
            </span>
          </Button>
        </div>
      </div>

      <div className={styles.content} key={activeTab} ref={revealRef}>
        {activeTab === 'overview' && (
          <UsageOverviewTab kpi={analytics.kpi} trends={analytics.hourlyTrends} />
        )}
        {activeTab === 'analytics' && (
          <UsageAnalyticsTab
            modelRanks={analytics.modelRanks}
            providerRanks={analytics.providerRanks}
            keyRanks={analytics.keyRanks}
            hourlyDistribution={analytics.hourlyDistribution}
          />
        )}
        {activeTab === 'requests' && <UsageRequestsTab records={records} />}
        {activeTab === 'pricing' && <UsagePricingTab records={records} />}
      </div>
    </div>
  );
}
