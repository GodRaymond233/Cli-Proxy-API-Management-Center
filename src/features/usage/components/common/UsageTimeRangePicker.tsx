import type { UsageTimeRange } from '@/types/usage';
import styles from './UsageTimeRangePicker.module.scss';

interface UsageTimeRangePickerProps {
  value: UsageTimeRange;
  onChange: (val: UsageTimeRange) => void;
}

const TIME_RANGES: { key: UsageTimeRange; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: '24h', label: '最近 24 小时' },
  { key: '7d', label: '最近 7 天' },
  { key: '30d', label: '最近 30 天' },
  { key: 'all', label: '全部时间' },
];

export function UsageTimeRangePicker({ value, onChange }: UsageTimeRangePickerProps) {
  return (
    <div className={styles.container}>
      {TIME_RANGES.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.button} ${value === item.key ? styles.active : ''}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
