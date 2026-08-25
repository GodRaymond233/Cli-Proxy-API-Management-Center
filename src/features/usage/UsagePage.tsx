import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsageTimeRange, UsageFilterParams } from '@/types/usage';
import { useUsageRecords } from './hooks/useUsageRecords';
import { useUsageAnalytics } from './hooks/useUsageAnalytics';
import { UsageTimeRangePicker } from './components/common/UsageTimeRangePicker';
import { UsageOverviewTab } from './components/overview/UsageOverviewTab';
import { UsageAnalyticsTab } from './components/analytics/UsageAnalyticsTab';
import { UsageRequestsTab } from './components/requests/UsageRequestsTab';
import { UsagePricingTab } from './components/pricing/UsagePricingTab';
import { Button } from '@/components/ui/Button';
import { logsApi } from '@/services/api/logs';
import { parseUsageRecordFromLog } from './collector/logCollector';
import { usageStorage } from './storage/usageStorage';
import { usePricingStore } from './hooks/usePricingStore';
import styles from './UsagePage.module.scss';

type ActiveTab = 'overview' | 'analytics' | 'requests' | 'pricing';

export function UsagePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [timeRange, setTimeRange] = useState<UsageTimeRange>('24h');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const getAllRules = usePricingStore((state) => state.getAllRules);

  const filterParams: UsageFilterParams = useMemo(() => {
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
        endTime: now,
      },
    };
  }, [timeRange]);

  const { records, totalCount, refetch, clearRecords, loadSampleData } = useUsageRecords(
    filterParams,
    autoRefresh
  );
  const analytics = useUsageAnalytics(records);

  // Background log parser sync from /logs
  useEffect(() => {
    async function syncLogs() {
      try {
        const res = await logsApi.fetchLogs({ limit: 100 });
        if (res?.lines?.length) {
          const rules = getAllRules();
          const parsedRecords = res.lines
            .map((line) => parseUsageRecordFromLog(line, rules))
            .filter((r): r is NonNullable<typeof r> => r !== null);

          if (parsedRecords.length > 0) {
            await usageStorage.saveRecords(parsedRecords);
            await refetch();
          }
        }
      } catch {
        // Ignored in background
      }
    }

    void syncLogs();
    const interval = setInterval(syncLogs, 15000);
    return () => clearInterval(interval);
  }, [getAllRules, refetch]);

  return (
    <div className={styles.page}>
      {/* Top Banner Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.badge}>LOCAL USAGE</div>
          <h1 className={styles.title}>使用记录</h1>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.collectorStatus}>
            <span className={styles.greenDot} />
            <span>本地采集进行中</span>
            <span className={styles.countBadge}>{totalCount.toLocaleString()} 条长期记录</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            title="刷新数据"
          >
            🔄
          </Button>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className={styles.navBar}>
        <div className={styles.tabButtons}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.active : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📊 总览
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'analytics' ? styles.active : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            📈 分析
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'requests' ? styles.active : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            📑 请求明细
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'pricing' ? styles.active : ''}`}
            onClick={() => setActiveTab('pricing')}
          >
            💲 价格统计
          </button>
        </div>

        <div className={styles.globalActions}>
          <UsageTimeRangePicker value={timeRange} onChange={setTimeRange} />
          <Button
            size="sm"
            variant={autoRefresh ? 'primary' : 'outline'}
            onClick={() => setAutoRefresh((prev) => !prev)}
          >
            {autoRefresh ? '自动刷新中 (10s)' : '开启自动刷新'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadSampleData}
            title="生成丰富演示数据"
          >
            生成模拟数据
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clearRecords}
            title="清空记录"
          >
            清空
          </Button>
        </div>
      </div>

      {/* Tab Content Display */}
      <div className={styles.content}>
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
