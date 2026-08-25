import type { UsageKpiSummary } from '@/types/usage';
import { formatCompactNumber } from '@/utils/format';
import styles from './TokenCompositionCard.module.scss';

interface TokenCompositionCardProps {
  kpi: UsageKpiSummary;
}

export function TokenCompositionCard({ kpi }: TokenCompositionCardProps) {
  const { inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, totalTokens } = kpi;

  const inputPct = totalTokens > 0 ? ((inputTokens / totalTokens) * 100).toFixed(1) : '0';
  const outputPct = totalTokens > 0 ? ((outputTokens / totalTokens) * 100).toFixed(1) : '0';
  const reasoningPct = totalTokens > 0 ? ((reasoningTokens / totalTokens) * 100).toFixed(1) : '0';
  const cacheReadPct = totalTokens > 0 ? ((cacheReadTokens / totalTokens) * 100).toFixed(1) : '0';
  const cacheWritePct = totalTokens > 0 ? ((cacheWriteTokens / totalTokens) * 100).toFixed(1) : '0';

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Token 构成</h3>
        <span className={styles.subtitle}>缓存、思考与生成消耗</span>
      </div>

      <div className={styles.rows}>
        {/* 输入 */}
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.label}>输入 (Prompt)</span>
            <span className={styles.nums}>
              <b>{formatCompactNumber(inputTokens)}</b>
              <span className={styles.pct}>{inputPct}%</span>
            </span>
          </div>
          <div className={styles.track}>
            <div className={`${styles.bar} ${styles.blue}`} style={{ width: `${inputPct}%` }} />
          </div>
        </div>

        {/* 输出 */}
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.label}>输出 (Completion)</span>
            <span className={styles.nums}>
              <b>{formatCompactNumber(outputTokens)}</b>
              <span className={styles.pct}>{outputPct}%</span>
            </span>
          </div>
          <div className={styles.track}>
            <div className={`${styles.bar} ${styles.emerald}`} style={{ width: `${outputPct}%` }} />
          </div>
        </div>

        {/* 思考推理 */}
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.label}>思考 (Reasoning)</span>
            <span className={styles.nums}>
              <b>{formatCompactNumber(reasoningTokens)}</b>
              <span className={styles.pct}>{reasoningPct}%</span>
            </span>
          </div>
          <div className={styles.track}>
            <div className={`${styles.bar} ${styles.purple}`} style={{ width: `${reasoningPct}%` }} />
          </div>
        </div>

        {/* 缓存读取 */}
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.label}>缓存读取 (Cache Read)</span>
            <span className={styles.nums}>
              <b>{formatCompactNumber(cacheReadTokens)}</b>
              <span className={styles.pct}>{cacheReadPct}%</span>
            </span>
          </div>
          <div className={styles.track}>
            <div className={`${styles.bar} ${styles.amber}`} style={{ width: `${cacheReadPct}%` }} />
          </div>
        </div>

        {/* 缓存创建 */}
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.label}>缓存创建 (Cache Create)</span>
            <span className={styles.nums}>
              <b>{formatCompactNumber(cacheWriteTokens)}</b>
              <span className={styles.pct}>{cacheWritePct}%</span>
            </span>
          </div>
          <div className={styles.track}>
            <div className={`${styles.bar} ${styles.cyan}`} style={{ width: `${cacheWritePct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
