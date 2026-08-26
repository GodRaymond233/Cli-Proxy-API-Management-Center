import type { HourlyDistributionItem } from '@/types/usage';
import { Card } from '@/components/ui/Card';
import styles from './HourlyDistributionCard.module.scss';

interface HourlyDistributionCardProps {
  distribution: HourlyDistributionItem[];
}

export function HourlyDistributionCard({ distribution }: HourlyDistributionCardProps) {
  const maxReq = Math.max(1, ...distribution.map((d) => d.requestCount));

  return (
    <Card title="时段分布" className={styles.card}>
      <div className="hint">24 小时活跃时段分布与热度</div>

      <div className={styles.chart}>
        {distribution.map((d, idx) => {
          const heightPct = Math.round((d.requestCount / maxReq) * 100);
          return (
            <div key={d.hour} className={styles.col} title={`${d.label}: ${d.requestCount} 次 (${d.percentage}%)`}>
              <div className={styles.barWrapper}>
                <div
                  className={styles.bar}
                  style={{ height: `${Math.max(4, heightPct)}%`, animationDelay: `${idx * 24}ms` }}
                />
              </div>
              <span className={styles.label}>{d.hour % 3 === 0 ? `${d.hour}h` : ''}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
