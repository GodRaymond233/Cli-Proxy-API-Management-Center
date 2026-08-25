import type { UsageKpiSummary, HourlyTrendBucket } from '@/types/usage';
import { UsageKpiGrid } from './UsageKpiGrid';
import { UsageTrendChart } from './UsageTrendChart';
import { TokenCompositionCard } from './TokenCompositionCard';
import styles from './UsageOverviewTab.module.scss';

interface UsageOverviewTabProps {
  kpi: UsageKpiSummary;
  trends: HourlyTrendBucket[];
}

export function UsageOverviewTab({ kpi, trends }: UsageOverviewTabProps) {
  return (
    <div className={styles.container}>
      <UsageKpiGrid kpi={kpi} />

      <div className={styles.chartsGrid}>
        <div className={styles.trendCol}>
          <UsageTrendChart trends={trends} />
        </div>
        <div className={styles.tokenCol}>
          <TokenCompositionCard kpi={kpi} />
        </div>
      </div>
    </div>
  );
}
