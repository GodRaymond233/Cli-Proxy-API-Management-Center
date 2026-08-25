import type { RankItem } from '@/types/usage';
import { formatCompactNumber } from '@/utils/format';
import styles from './AnalyticsRankCard.module.scss';

interface AnalyticsRankCardProps {
  title: string;
  subtitle?: string;
  items: RankItem[];
  maxDisplay?: number;
}

export function AnalyticsRankCard({
  title,
  subtitle = '按 Token 排序',
  items,
  maxDisplay = 8,
}: AnalyticsRankCardProps) {
  const displayItems = items.slice(0, maxDisplay);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>

      <div className={styles.list}>
        {displayItems.length === 0 ? (
          <div className={styles.empty}>暂无数据</div>
        ) : (
          displayItems.map((item, idx) => (
            <div key={item.id} className={styles.itemRow}>
              <div className={styles.metaRow}>
                <div className={styles.rankBadge}>
                  <span className={`${styles.badge} ${idx < 3 ? styles.topThree : ''}`}>
                    {idx + 1}
                  </span>
                  <span className={styles.itemLabel} title={item.label}>
                    {item.label}
                  </span>
                </div>
                <div className={styles.itemStats}>
                  <span className={styles.reqCount}>{item.count} requests</span>
                  <span className={styles.pct}>{item.percentage}%</span>
                  <span className={styles.tokenVal}>{formatCompactNumber(item.tokens)} Token</span>
                </div>
              </div>
              <div className={styles.track}>
                <div
                  className={styles.bar}
                  style={{ width: `${Math.max(2, item.percentage)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
