import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconSearch, IconX } from '@/components/ui/icons';
import styles from './RequestFiltersBar.module.scss';

interface RequestFiltersBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedModel: string;
  onModelChange: (m: string) => void;
  selectedProvider: string;
  onProviderChange: (p: string) => void;
  selectedStatusGroup: string;
  onStatusGroupChange: (s: string) => void;
  models: string[];
  providers: string[];
  totalCount: number;
}

export function RequestFiltersBar({
  searchQuery,
  onSearchChange,
  selectedModel,
  onModelChange,
  selectedProvider,
  onProviderChange,
  selectedStatusGroup,
  onStatusGroupChange,
  models,
  providers,
  totalCount,
}: RequestFiltersBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.searchWrapper}>
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索 Request ID、模型、Key、IP..."
          className={styles.searchInput}
          rightElement={
            searchQuery ? (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => onSearchChange('')}
                title="清除"
                aria-label="清除"
              >
                <IconX size={16} />
              </button>
            ) : (
              <IconSearch size={16} className={styles.searchIcon} />
            )
          }
        />
      </div>

      <Select
        size="sm"
        value={selectedModel}
        onChange={onModelChange}
        ariaLabel="模型筛选"
        options={[
          { value: '', label: '全部模型' },
          ...models.map((m) => ({ value: m, label: m })),
        ]}
      />

      <Select
        size="sm"
        value={selectedProvider}
        onChange={onProviderChange}
        ariaLabel="Provider 筛选"
        options={[
          { value: '', label: '全部 Provider' },
          ...providers.map((p) => ({ value: p, label: p })),
        ]}
      />

      <Select
        size="sm"
        value={selectedStatusGroup}
        onChange={onStatusGroupChange}
        ariaLabel="状态筛选"
        options={[
          { value: 'all', label: '全部结果' },
          { value: '2xx', label: '2xx 成功' },
          { value: '4xx', label: '4xx 客户端异常' },
          { value: '5xx', label: '5xx 服务端错误' },
        ]}
      />

      <span className={styles.countText}>
        共 <b>{totalCount}</b> 条记录
      </span>
    </div>
  );
}
