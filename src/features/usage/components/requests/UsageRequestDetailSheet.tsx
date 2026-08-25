import type { UsageRecord } from '@/types/usage';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { copyToClipboard } from '@/utils/clipboard';
import styles from './UsageRequestDetailSheet.module.scss';

interface UsageRequestDetailSheetProps {
  record: UsageRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UsageRequestDetailSheet({
  record,
  isOpen,
  onClose,
}: UsageRequestDetailSheetProps) {
  if (!record) return null;

  const dateStr = new Date(record.timestamp).toLocaleString();

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="请求日志详情">
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>基本信息</div>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.label}>Request ID</span>
              <span className={styles.valMono}>{record.requestId}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>请求时间</span>
              <span className={styles.val}>{dateStr}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>HTTP 状态</span>
              <span className={`${styles.statusBadge} ${record.statusCode < 400 ? styles.ok : styles.err}`}>
                {record.statusCode}
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>延迟耗时</span>
              <span className={styles.val}>{record.latencyMs} ms</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>请求路径</span>
              <span className={styles.valMono}>{record.httpMethod} {record.endpoint}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>鉴权密钥</span>
              <span className={styles.val}>{record.keyName || '—'}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>模型与供应商</div>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.label}>实际调用模型</span>
              <span className={styles.valMono}>{record.model}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>归一化模型</span>
              <span className={styles.val}>{record.normalizedModel}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Provider</span>
              <span className={styles.val}>{record.provider}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>预估费用</span>
              <span className={styles.valHighlight}>${record.estimatedCostUsd.toFixed(5)}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Token 消耗拆解</div>
          <div className={styles.tokenGrid}>
            <div className={styles.tokenBox}>
              <span className={styles.tokenNum}>{record.usage.inputTokens.toLocaleString()}</span>
              <span className={styles.tokenLabel}>输入 Token</span>
            </div>
            <div className={styles.tokenBox}>
              <span className={styles.tokenNum}>{record.usage.outputTokens.toLocaleString()}</span>
              <span className={styles.tokenLabel}>输出 Token</span>
            </div>
            <div className={styles.tokenBox}>
              <span className={styles.tokenNum}>{(record.usage.reasoningTokens ?? 0).toLocaleString()}</span>
              <span className={styles.tokenLabel}>思考推理</span>
            </div>
            <div className={styles.tokenBox}>
              <span className={styles.tokenNum}>{(record.usage.cacheReadTokens ?? 0).toLocaleString()}</span>
              <span className={styles.tokenLabel}>缓存命中</span>
            </div>
            <div className={styles.tokenBox}>
              <span className={styles.tokenNum}>{record.usage.totalTokens.toLocaleString()}</span>
              <span className={styles.tokenLabel}>总 Token</span>
            </div>
          </div>
        </div>

        {record.errorMessage && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>错误信息</div>
            <div className={styles.errBox}>{record.errorMessage}</div>
          </div>
        )}

        <div className={styles.footer}>
          <Button
            variant="outline"
            onClick={() => copyToClipboard(JSON.stringify(record, null, 2))}
          >
            复制完整 JSON
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
