import type { UsageKpiSummary } from '@/types/usage';
import { formatCompactNumber } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import styles from './TokenCompositionCard.module.scss';

interface TokenCompositionCardProps {
  kpi: UsageKpiSummary;
}

export function TokenCompositionCard({ kpi }: TokenCompositionCardProps) {
  const { inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, totalTokens } = kpi;

  const rows = [
    { label: '输入 (Prompt)', value: inputTokens, colorClass: styles.input },
    { label: '输出 (Completion)', value: outputTokens, colorClass: styles.output },
    { label: '思考 (Reasoning)', value: reasoningTokens, colorClass: styles.reasoning },
    { label: '缓存读取 (Cache Read)', value: cacheReadTokens, colorClass: styles.cacheRead },
    { label: '缓存创建 (Cache Create)', value: cacheWriteTokens, colorClass: styles.cacheWrite },
  ];

  return (
    <Card title="Token 构成" className={styles.card}>
      <div className="hint">缓存、思考与生成消耗</div>

      <div className={styles.rows}>
        {rows.map((row) => {
          const pct = totalTokens > 0 ? ((row.value / totalTokens) * 100).toFixed(1) : '0';
          return (
            <div key={row.label} className={styles.row}>
              <div className={styles.rowInfo}>
                <span className={styles.label}>{row.label}</span>
                <span className={styles.nums}>
                  <b>{formatCompactNumber(row.value)}</b>
                  <span className={styles.pct}>{pct}%</span>
                </span>
              </div>
              <div className={styles.track}>
                <div className={`${styles.bar} ${row.colorClass}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
