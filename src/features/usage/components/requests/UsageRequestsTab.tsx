import { useState, useMemo } from 'react';
import type { UsageRecord } from '@/types/usage';
import { RequestFiltersBar } from './RequestFiltersBar';
import { UsageRequestDetailSheet } from './UsageRequestDetailSheet';
import { Button } from '@/components/ui/Button';
import styles from './UsageRequestsTab.module.scss';

interface UsageRequestsTabProps {
  records: UsageRecord[];
}

export function UsageRequestsTab({ records }: UsageRequestsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedStatusGroup, setSelectedStatusGroup] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [inspectRecord, setInspectRecord] = useState<UsageRecord | null>(null);

  // Extract unique models & providers
  const models = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.model) set.add(r.model);
    });
    return Array.from(set).sort();
  }, [records]);

  const providers = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.provider) set.add(r.provider);
    });
    return Array.from(set).sort();
  }, [records]);

  // In-memory filter
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedModel && r.model !== selectedModel) return false;
      if (selectedProvider && r.provider !== selectedProvider) return false;
      if (selectedStatusGroup !== 'all') {
        const prefix = selectedStatusGroup[0];
        if (!String(r.statusCode).startsWith(prefix)) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = r.requestId?.toLowerCase().includes(q);
        const matchModel = r.model?.toLowerCase().includes(q);
        const matchKey = r.keyName?.toLowerCase().includes(q);
        const matchIp = r.sourceIp?.toLowerCase().includes(q);
        if (!matchId && !matchModel && !matchKey && !matchIp) return false;
      }
      return true;
    });
  }, [records, selectedModel, selectedProvider, selectedStatusGroup, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  return (
    <div className={styles.container}>
      <RequestFiltersBar
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setPage(1);
        }}
        selectedModel={selectedModel}
        onModelChange={(m) => {
          setSelectedModel(m);
          setPage(1);
        }}
        selectedProvider={selectedProvider}
        onProviderChange={(p) => {
          setSelectedProvider(p);
          setPage(1);
        }}
        selectedStatusGroup={selectedStatusGroup}
        onStatusGroupChange={(s) => {
          setSelectedStatusGroup(s);
          setPage(1);
        }}
        models={models}
        providers={providers}
        totalCount={filteredRecords.length}
      />

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>时间</th>
              <th>模型</th>
              <th>Provider</th>
              <th>来源</th>
              <th>鉴权密钥</th>
              <th>输入</th>
              <th>输出</th>
              <th>思考</th>
              <th>缓存</th>
              <th>总计</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {pagedRecords.length === 0 ? (
              <tr>
                <td colSpan={11} className={styles.empty}>
                  未找到符合条件的请求记录
                </td>
              </tr>
            ) : (
              pagedRecords.map((r) => {
                const date = new Date(r.timestamp);
                const timeStr = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
                const isSuccess = r.statusCode >= 200 && r.statusCode < 400;

                return (
                  <tr
                    key={r.id}
                    className={styles.row}
                    onClick={() => setInspectRecord(r)}
                  >
                    <td className={styles.timeCell}>{timeStr}</td>
                    <td>
                      <div className={styles.modelCell}>
                        <span className={styles.modelName}>{r.normalizedModel || r.model}</span>
                        <span className={styles.modelSub}>{r.model}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.providerBadge}>{r.provider}</span>
                    </td>
                    <td>
                      <span className={styles.sourceTag}>摸鱼站Pro分组</span>
                    </td>
                    <td>
                      <div className={styles.keyCell}>
                        <span className={styles.keyTag}>未备注</span>
                        <span className={styles.keySub}>{r.keyName || 'cpa-••••0849'}</span>
                      </div>
                    </td>
                    <td className={styles.numCell}>{r.usage.inputTokens.toLocaleString()}</td>
                    <td className={styles.numCell}>{r.usage.outputTokens.toLocaleString()}</td>
                    <td className={styles.numCell}>{(r.usage.reasoningTokens ?? 0).toLocaleString()}</td>
                    <td className={styles.numCell}>{(r.usage.cacheReadTokens ?? 0).toLocaleString()}</td>
                    <td className={styles.numCellBold}>{r.usage.totalTokens.toLocaleString()}</td>
                    <td>
                      <div className={styles.statusCell}>
                        <span className={`${styles.statusDot} ${isSuccess ? styles.ok : styles.err}`} />
                        <span className={styles.protoText}>HTTP</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <Button
            size="sm"
            variant="secondary"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </Button>
          <span className={styles.pageInfo}>
            第 {currentPage} / {totalPages} 页
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </Button>
        </div>
      )}

      <UsageRequestDetailSheet
        record={inspectRecord}
        isOpen={Boolean(inspectRecord)}
        onClose={() => setInspectRecord(null)}
      />
    </div>
  );
}
