import { useMemo, useState } from 'react';
import type { HourlyTrendBucket } from '@/types/usage';
import { formatCompactNumber } from '@/utils/format';
import { buildSmoothLinePath } from '@/features/dashboard/components/curve';
import styles from './UsageTrendChart.module.scss';

interface UsageTrendChartProps {
  trends: HourlyTrendBucket[];
}

export function UsageTrendChart({ trends }: UsageTrendChartProps) {
  const [metricMode, setMetricMode] = useState<'requests' | 'tokens' | 'cost'>('requests');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const values = useMemo(() => {
    return trends.map((t) => {
      if (metricMode === 'requests') return t.requestCount;
      if (metricMode === 'tokens') return t.totalTokens;
      return t.estimatedCostUsd;
    });
  }, [trends, metricMode]);

  const maxVal = useMemo(() => Math.max(1, ...values), [values]);

  const width = 800;
  const height = 220;
  const paddingX = 20;
  const paddingY = 20;

  const points: [number, number][] = useMemo(() => {
    if (values.length < 2) return [];
    return values.map((val, idx) => {
      const x = paddingX + (idx / (values.length - 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (val / maxVal) * (height - 2 * paddingY);
      return [x, y];
    });
  }, [values, maxVal, width, height, paddingX, paddingY]);

  const linePath = useMemo(() => buildSmoothLinePath(points), [points]);

  const areaPath = useMemo(() => {
    if (!points.length) return '';
    const firstX = points[0][0];
    const lastX = points[points.length - 1][0];
    const bottomY = height - paddingY;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [points, linePath, height, paddingY]);

  const activeBucket = hoverIndex !== null ? trends[hoverIndex] : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>请求与 Token 趋势</h3>
          <span className={styles.subtitle}>按系统本地小时聚合</span>
        </div>
        <div className={styles.toggles}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${metricMode === 'requests' ? styles.active : ''}`}
            onClick={() => setMetricMode('requests')}
          >
            请求数
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${metricMode === 'tokens' ? styles.active : ''}`}
            onClick={() => setMetricMode('tokens')}
          >
            Token 消耗
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${metricMode === 'cost' ? styles.active : ''}`}
            onClick={() => setMetricMode('cost')}
          >
            预估费用
          </button>
        </div>
      </div>

      <div className={styles.chartWrapper}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={styles.svg}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="usageTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="var(--border-color)" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="var(--border-color)" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="var(--border-color)" />

          {/* Area & Line */}
          {areaPath && <path d={areaPath} fill="url(#usageTrendGrad)" />}
          {linePath && <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />}

          {/* Interaction Points */}
          {points.map(([px, py], idx) => (
            <g key={idx} onMouseEnter={() => setHoverIndex(idx)}>
              <circle cx={px} cy={py} r="10" fill="transparent" className={styles.hitArea} />
              {(hoverIndex === idx || idx === points.length - 1) && (
                <circle cx={px} cy={py} r="4.5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
              )}
            </g>
          ))}
        </svg>

        {/* Floating Tooltip */}
        {activeBucket && hoverIndex !== null && points[hoverIndex] && (
          <div
            className={styles.tooltip}
            style={{
              left: `${(points[hoverIndex][0] / width) * 100}%`,
              top: `${(points[hoverIndex][1] / height) * 100}%`,
            }}
          >
            <div className={styles.tooltipTime}>{activeBucket.hourLabel}</div>
            <div className={styles.tooltipRow}>
              <span>请求数:</span> <b>{activeBucket.requestCount.toLocaleString()}</b>
            </div>
            <div className={styles.tooltipRow}>
              <span>Token:</span> <b>{formatCompactNumber(activeBucket.totalTokens)}</b>
            </div>
            <div className={styles.tooltipRow}>
              <span>预估费用:</span> <b>${activeBucket.estimatedCostUsd.toFixed(4)}</b>
            </div>
          </div>
        )}
      </div>

      <div className={styles.xAxisLabels}>
        <span>{trends[0]?.hourLabel || '—'}</span>
        <span>{trends[Math.floor(trends.length / 2)]?.hourLabel || ''}</span>
        <span>{trends[trends.length - 1]?.hourLabel || '—'}</span>
      </div>
    </div>
  );
}
