import { useState, useMemo, useEffect } from 'react';
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
import { parseUsageRecordFromLog } from './collector/logCollector';
import { usageStorage } from './storage/usageStorage';
import { usePricingStore } from './hooks/usePricingStore';
import styles from './UsagePage.module.scss';

type ActiveTab = 'overview' | 'analytics' | 'requests' | 'pricing';

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
  const getAllRules = usePricingStore((state) => state.getAllRules);

  // 切换页签时重放入场级联（容器随 key 重挂载）
  const revealRef = useRevealGroup<HTMLDivElement>();

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
  const analytics = useUsageAnalytics(records, filterParams.timeRange.startTime);

  useHeaderRefresh(() => refetch());

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
          <Button size="sm" variant="secondary" onClick={() => refetch()} title="刷新数据">
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
          <Button size="sm" variant="secondary" onClick={loadSampleData} title="生成丰富演示数据">
            生成模拟数据
          </Button>
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
