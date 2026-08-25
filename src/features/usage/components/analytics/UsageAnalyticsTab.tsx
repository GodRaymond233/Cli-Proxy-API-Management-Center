import type { RankItem, HourlyDistributionItem } from '@/types/usage';
import { AnalyticsRankCard } from './AnalyticsRankCard';
import { HourlyDistributionCard } from './HourlyDistributionCard';
import styles from './UsageAnalyticsTab.module.scss';

interface UsageAnalyticsTabProps {
  modelRanks: RankItem[];
  providerRanks: RankItem[];
  keyRanks: RankItem[];
  hourlyDistribution: HourlyDistributionItem[];
}

export function UsageAnalyticsTab({
  modelRanks,
  providerRanks,
  keyRanks,
  hourlyDistribution,
}: UsageAnalyticsTabProps) {
  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        <AnalyticsRankCard title="模型使用" subtitle="按 Token 排序" items={modelRanks} />
        <AnalyticsRankCard title="Provider" subtitle="按 Token 排序" items={providerRanks} />
        <AnalyticsRankCard title="请求来源" subtitle="按 Token 排序" items={keyRanks} />
        <AnalyticsRankCard title="鉴权密钥" subtitle="按 Token 排序" items={keyRanks} />
      </div>

      <div className={styles.fullWidth}>
        <HourlyDistributionCard distribution={hourlyDistribution} />
      </div>
    </div>
  );
}
