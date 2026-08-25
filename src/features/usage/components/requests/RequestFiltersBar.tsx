import styles from './RequestFiltersBar.module.scss';

interface RequestFiltersBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedModel: string;
  onModelChange: (m: string) => void;
  selectedProvider: string;
  onProviderChange: (p: string) => void;
  selectedStatusGroup: string;
  onStatusGroupChange: (s: any) => void;
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
      <div className={styles.left}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            className={styles.input}
            placeholder="搜索 Request ID、模型、Key..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <select
          className={styles.select}
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
        >
          <option value="">全部模型</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          className={styles.select}
          value={selectedProvider}
          onChange={(e) => onProviderChange(e.target.value)}
        >
          <option value="">全部 Provider</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          className={styles.select}
          value={selectedStatusGroup}
          onChange={(e) => onStatusGroupChange(e.target.value)}
        >
          <option value="all">全部结果</option>
          <option value="2xx">2xx 成功</option>
          <option value="4xx">4xx 客户端异常</option>
          <option value="5xx">5xx 服务端错误</option>
        </select>
      </div>

      <div className={styles.right}>
        <span className={styles.countText}>共 <b>{totalCount}</b> 条记录</span>
      </div>
    </div>
  );
}
