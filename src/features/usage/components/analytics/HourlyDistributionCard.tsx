import type { HourlyDistributionItem } from '@/types/usage';
import styles from './HourlyDistributionCard.module.scss';

interface HourlyDistributionCardProps {
  distribution: HourlyDistributionItem[];
}

export function HourlyDistributionCard({ distribution }: HourlyDistributionCardProps) {
  const maxReq = Math.max(1, ...distribution.map((d) => d.requestCount));

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>时段分布</h3>
          <span className={styles.subtitle}>24 小时活跃时段分布与热度</span>
        </div>
      </div>

      <div className={styles.chart}>
        {distribution.map((d) => {
          const heightPct = Math.round((d.requestCount / maxReq) * 100);
          return (
            <div key={d.hour} className={styles.col} title={`${d.label}: ${d.requestCount} 次 (${d.percentage}%)`}>
              <div className={styles.barWrapper}>
                <div
                  className={styles.bar}
                  style={{ height: `${Math.max(4, heightPct)}%` }}
                />
              </div>
              <span className={styles.label}>{d.hour % 3 === 0 ? `${d.hour}h` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
