import { useState, useMemo } from 'react';
import type { UsageRecord } from '@/types/usage';
import { RequestFiltersBar } from './RequestFiltersBar';
import { UsageRequestDetailSheet } from './UsageRequestDetailSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { maskInstanceLabel } from '../../collector/logCollector';
import styles from './UsageRequestsTab.module.scss';

const EFFORT_RANK: Record<string, number> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  'extra-high': 4,
  max: 5,
};

const effortClass = (effort: string): string => {
  const rank = EFFORT_RANK[effort.toLowerCase()] ?? -1;
  if (rank < 0) return styles.effortChip;
  if (rank <= 1) return `${styles.effortChip} ${styles.effortLow}`;
  if (rank === 2) return `${styles.effortChip} ${styles.effortMedium}`;
  if (rank === 3) return `${styles.effortChip} ${styles.effortHigh}`;
  if (rank === 4) return `${styles.effortChip} ${styles.effortXhigh}`;
  return `${styles.effortChip} ${styles.effortMax}`;
};

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
        const matchAlias = r.modelAlias?.toLowerCase().includes(q);
        const matchRequested = r.requestedModel?.toLowerCase().includes(q);
        const matchInstance = r.providerInstanceLabel?.toLowerCase().includes(q);
        const matchInstanceId = r.providerInstanceId?.toLowerCase().includes(q);
        if (
          !matchId &&
          !matchModel &&
          !matchKey &&
          !matchIp &&
          !matchAlias &&
          !matchRequested &&
          !matchInstance &&
          !matchInstanceId
        ) {
          return false;
        }
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
    <Card className={styles.card} title="请求记录" extra={
      <span className={styles.recordCount}>共 {filteredRecords.length.toLocaleString()} 条</span>
    }>
      <div className={styles.container} data-reveal>
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
                <th>鉴权密钥</th>
                <th>输入 / 输出</th>
                <th>缓存命中率</th>
                <th>费用</th>
                <th>耗时</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.empty}>
                    未找到符合条件的请求记录
                  </td>
                </tr>
              ) : (
                pagedRecords.map((r) => {
                  const date = new Date(r.timestamp);
                  const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
                  const isSuccess = r.statusCode >= 200 && r.statusCode < 400;
                  const { inputTokens, outputTokens } = r.usage;
                  const cacheRead = r.usage.cacheReadTokens ?? 0;
                  const cacheWrite = r.usage.cacheWriteTokens ?? 0;
                  // 与总览 KPI 同口径：Anthropic 语义下 input 与缓存读/写互不相交，
                  // 命中率 = 缓存读 ÷ 输入侧总量（input + cacheRead + cacheWrite），恒 ≤ 100%
                  const cacheInputTotal = inputTokens + cacheRead + cacheWrite;
                  const cacheHitRate = cacheInputTotal > 0 ? (cacheRead / cacheInputTotal) * 100 : 0;
                  const latencySec = r.latencyMs / 1000;
                  const tokensPerSec = latencySec > 0 ? Math.round(outputTokens / latencySec) : 0;

                  return (
                    <tr
                      key={r.id}
                      className={styles.row}
                      onClick={() => setInspectRecord(r)}
                    >
                      <td className={styles.timeCell}>{timeStr}</td>
                      <td>
                        <div className={styles.modelCell}>
                          <span className={styles.modelMainRow}>
                            <span className={styles.modelName}>
                              {r.modelAlias || r.model}
                            </span>
                            {r.reasoningEffort && (
                              <span className={effortClass(r.reasoningEffort)}>
                                {r.reasoningEffort}
                              </span>
                            )}
                          </span>
                          <span className={styles.modelSub}>
                            {r.requestedModel && r.requestedModel !== r.model
                              ? `${r.requestedModel} → ${r.model}`
                              : r.model}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.modelCell}>
                          <span className={styles.modelMainRow}>
                            {r.providerAuthType === 'oauth' && (
                              <span className={`${styles.effortChip} ${styles.authChip}`}>
                                OAuth
                              </span>
                            )}
                            <span
                              className={styles.modelName}
                              title={r.providerInstanceUrl || undefined}
                            >
                              {r.providerInstanceUrl ||
                                maskInstanceLabel(
                                  r.providerInstanceLabel,
                                  r.providerAuthType
                                ) ||
                                '—'}
                            </span>
                          </span>
                          <span className={styles.providerBadge}>{r.provider}</span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.monoCell}>{r.keyName || '—'}</span>
                      </td>
                      <td>
                        <div className={styles.ioCell}>
                          <span className={styles.ioNums}>
                            {inputTokens.toLocaleString()} / {outputTokens.toLocaleString()}
                          </span>
                          {cacheRead > 0 && (
                            <span className={styles.ioCache}>缓存 {cacheRead.toLocaleString()}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {cacheHitRate > 0 ? (
                          <span className={styles.cacheHitRate}>{cacheHitRate.toFixed(1)}%</span>
                        ) : (
                          <span className={styles.monoCell}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={styles.costPill}>${r.estimatedCostUsd.toFixed(6)}</span>
                      </td>
                      <td>
                        <div className={styles.latencyCell}>
                          <span className={styles.latencyNum}>{latencySec.toFixed(1)}s</span>
                          {tokensPerSec > 0 && (
                            <span className={styles.latencySub}>{tokensPerSec} t/s</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.statusCell}>
                          <span className={`${styles.statusDot} ${isSuccess ? styles.ok : styles.err}`} />
                          <span className={styles.statusCode}>{r.statusCode}</span>
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
      </div>

      <UsageRequestDetailSheet
        record={inspectRecord}
        open={Boolean(inspectRecord)}
        onClose={() => setInspectRecord(null)}
      />
    </Card>
  );
}
