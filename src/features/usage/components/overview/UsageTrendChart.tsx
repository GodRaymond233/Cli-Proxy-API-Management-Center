import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { HourlyTrendBucket } from '@/types/usage';
import { formatCompactNumber } from '@/utils/format';
import { buildSmoothLinePath } from '@/features/dashboard/components/curve';
import { Card } from '@/components/ui/Card';
import styles from './UsageTrendChart.module.scss';

interface UsageTrendChartProps {
  trends: HourlyTrendBucket[];
}

type MetricMode = 'requests' | 'tokens' | 'cost';

const METRIC_TOGGLES: { key: MetricMode; label: string }[] = [
  { key: 'requests', label: '请求数' },
  { key: 'tokens', label: 'Token 消耗' },
  { key: 'cost', label: '预估费用' },
];

export function UsageTrendChart({ trends }: UsageTrendChartProps) {
  const [metricMode, setMetricMode] = useState<MetricMode>('requests');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const values = useMemo(() => {
    return trends.map((t) => {
      if (metricMode === 'requests') return t.requestCount;
      if (metricMode === 'tokens') return t.totalTokens;
      return t.estimatedCostUsd;
    });
  }, [trends, metricMode]);

  const maxVal = useMemo(() => Math.max(1, ...values), [values]);

  // viewBox 必须与容器实际像素 1:1：固定 800 宽 + 默认 meet 缩放会让画面居中 letterbox，
  // 曲线/网格与满宽分布的横轴标签永远对不齐（圆点也会被拉伸成椭圆）
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);

  useLayoutEffect(() => {
    const element = chartWrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setChartWidth(Math.round(w));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = chartWidth;
  const height = 220;
  const paddingX = 20;
  const paddingY = 20;

  const points: { x: number; y: number }[] = useMemo(() => {
    if (values.length < 2) return [];
    return values.map((val, idx) => {
      const x = paddingX + (idx / (values.length - 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (val / maxVal) * (height - 2 * paddingY);
      return { x, y };
    });
  }, [values, maxVal, width, height, paddingX, paddingY]);

  const linePath = useMemo(
    () => buildSmoothLinePath(points, paddingY, height - paddingY),
    [points, height, paddingY]
  );

  const areaPath = useMemo(() => {
    if (!points.length) return '';
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = height - paddingY;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [points, linePath, height, paddingY]);

  const activeBucket = hoverIndex !== null ? trends[hoverIndex] : null;

  const toggles = (
    <div className={styles.toggles}>
      {METRIC_TOGGLES.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.toggleBtn} ${metricMode === item.key ? styles.active : ''}`}
          onClick={() => setMetricMode(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <Card title="请求与 Token 趋势" extra={toggles} className={styles.card}>
      <div className="hint">按系统本地小时聚合</div>

      <div className={styles.chartWrapper} ref={chartWrapperRef}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={styles.svg}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="usageTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--wire-color)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--wire-color)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="var(--border-color)" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="var(--border-color)" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="var(--border-color)" />

          {/* Area & Line（key 随指标切换，重放描画动效） */}
          {areaPath && <path key={`area-${metricMode}`} d={areaPath} fill="url(#usageTrendGrad)" className={styles.areaPath} />}
          {linePath && (
            <path
              key={`line-${metricMode}`}
              d={linePath}
              fill="none"
              pathLength={1}
              className={styles.linePath}
            />
          )}

          {/* Interaction Points */}
          {points.map((pt, idx) => (
            <g key={idx} onMouseEnter={() => setHoverIndex(idx)}>
              <circle cx={pt.x} cy={pt.y} r="10" fill="transparent" className={styles.hitArea} />
              {(hoverIndex === idx || idx === points.length - 1) && (
                <circle cx={pt.x} cy={pt.y} r="4.5" className={styles.pointDot} />
              )}
            </g>
          ))}
        </svg>

        {/* Floating Tooltip */}
        {activeBucket && hoverIndex !== null && points[hoverIndex] && (
          <div
            className={styles.tooltip}
            style={{
              left: `${(points[hoverIndex].x / width) * 100}%`,
              top: `${(points[hoverIndex].y / height) * 100}%`,
            }}
          >
            <div className={styles.tooltipTime}>{activeBucket.hourLabel}</div>
            <div className={styles.tooltipRow}>
              <span>请求数</span> <b>{activeBucket.requestCount.toLocaleString()}</b>
            </div>
            <div className={styles.tooltipRow}>
              <span>Token</span> <b>{formatCompactNumber(activeBucket.totalTokens)}</b>
            </div>
            <div className={styles.tooltipRow}>
              <span>预估费用</span> <b>${activeBucket.estimatedCostUsd.toFixed(4)}</b>
            </div>
          </div>
        )}
      </div>

      <div className={styles.xAxisLabels}>
        <span>{trends[0]?.hourLabel || '—'}</span>
        <span>{trends[Math.floor(trends.length / 2)]?.hourLabel || ''}</span>
        <span>{trends[trends.length - 1]?.hourLabel || '—'}</span>
      </div>
    </Card>
  );
}
