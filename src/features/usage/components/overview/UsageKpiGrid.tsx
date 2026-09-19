import type { UsageKpiSummary } from '@/types/usage';
import { formatCompactNumber } from '@/utils/format';
import { useCountUp } from '@/hooks/motion';
import styles from './UsageKpiGrid.module.scss';

interface UsageKpiGridProps {
  kpi: UsageKpiSummary;
}

export function UsageKpiGrid({ kpi }: UsageKpiGridProps) {
  const animatedRequests = useCountUp(kpi.totalRequests);
  const animatedTokens = useCountUp(kpi.totalTokens);

  return (
    <div className={styles.grid}>
      {/* 1. 请求总数 */}
      <div className={styles.card} data-reveal>
        <div className={styles.label}>请求总数</div>
        <div className={styles.mainValue}>{animatedRequests.toLocaleString()}</div>
        <div className={styles.subMeta}>
          <span className={styles.successText}>成功 {kpi.successfulRequests.toLocaleString()}</span>
          <span className={styles.dot}>·</span>
          <span className={styles.failText}>失败 {kpi.failedRequests.toLocaleString()}</span>
        </div>
      </div>

      {/* 2. Token 总量 */}
      <div className={styles.card} data-reveal>
        <div className={styles.label}>Token 总量</div>
        <div className={styles.mainValue}>{formatCompactNumber(animatedTokens)}</div>
        <div className={styles.subMeta}>
          <span>入 {formatCompactNumber(kpi.inputTokens)}</span>
          <span className={styles.dot}>·</span>
          <span>出 {formatCompactNumber(kpi.outputTokens)}</span>
        </div>
      </div>

      {/* 3. 成功率 */}
      <div className={styles.card} data-reveal>
        <div className={styles.label}>成功率</div>
        <div className={styles.mainValue}>{kpi.successRate}%</div>
        <div className={styles.subMeta}>
          <span>思考 {formatCompactNumber(kpi.reasoningTokens)}</span>
        </div>
      </div>

      {/* 4. TPS & 响应延迟 */}
      <div className={styles.card} data-reveal>
        <div className={styles.label}>吞吐与延迟</div>
        <div className={styles.mainValue}>{kpi.tps} TPS</div>
        <div className={styles.subMeta}>
          <span>RPM {kpi.rpm}</span>
          <span className={styles.dot}>·</span>
          <span>均延 {kpi.avgLatencyMs}ms</span>
        </div>
      </div>

      {/* 5. 缓存命中率 */}
      <div className={styles.card} data-reveal>
        <div className={styles.label}>缓存命中率</div>
        <div className={styles.mainValue}>{kpi.cacheHitRate}%</div>
        <div className={styles.subMeta}>
          <span>缓存 {formatCompactNumber(kpi.cacheReadTokens)} / 输入侧 {formatCompactNumber(kpi.cacheInputTokens)}</span>
        </div>
      </div>

      {/* 6. 预估成本 */}
      <div className={styles.card} data-reveal>
        <div className={styles.label}>预估成本</div>
        <div className={styles.mainValue}>${kpi.totalCostUsd.toFixed(3)}</div>
        <div className={styles.subMeta}>
          <span>计价 {kpi.pricedRequestsCount} / {kpi.totalRequests} 笔</span>
        </div>
      </div>
    </div>
  );
}
