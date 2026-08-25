import { useState, useMemo } from 'react';
import type { ModelPricingRule, UsageRecord } from '@/types/usage';
import { usePricingStore } from '../../hooks/usePricingStore';
import { ModelPricingModal } from './ModelPricingModal';
import { Button } from '@/components/ui/Button';
import { formatCompactNumber } from '@/utils/format';
import styles from './UsagePricingTab.module.scss';

interface UsagePricingTabProps {
  records: UsageRecord[];
}

export function UsagePricingTab({ records }: UsagePricingTabProps) {
  const customRules = usePricingStore((state) => state.customRules);
  const addRule = usePricingStore((state) => state.addRule);
  const deleteRule = usePricingStore((state) => state.deleteRule);
  const resetToDefaults = usePricingStore((state) => state.resetToDefaults);
  const getAllRules = usePricingStore((state) => state.getAllRules);

  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ModelPricingRule | null>(null);

  const allRules = useMemo(() => getAllRules(), [getAllRules, customRules]);

  // Aggregate stats by model
  const modelStatsMap = useMemo(() => {
    const map = new Map<string, { requests: number; tokens: number; cost: number }>();
    records.forEach((r) => {
      const key = r.normalizedModel || r.model;
      const cur = map.get(key) || { requests: 0, tokens: 0, cost: 0 };
      cur.requests += 1;
      cur.tokens += r.usage.totalTokens;
      cur.cost += r.estimatedCostUsd;
      map.set(key, cur);
    });
    return map;
  }, [records]);

  const totalCost = useMemo(() => {
    return records.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
  }, [records]);

  const filteredRules = useMemo(() => {
    if (!searchQuery) return allRules;
    const q = searchQuery.toLowerCase().trim();
    return allRules.filter(
      (r) =>
        r.modelPattern.toLowerCase().includes(q) ||
        r.displayName.toLowerCase().includes(q) ||
        r.provider.toLowerCase().includes(q)
    );
  }, [allRules, searchQuery]);

  return (
    <div className={styles.container}>
      {/* Top Banner Cost Summary */}
      <div className={styles.topCard}>
        <div className={styles.costInfo}>
          <div className={styles.costNum}>${totalCost.toFixed(3)}</div>
          <div className={styles.costSub}>
            已计价 {records.length} 次请求 · 可用 {allRules.length} 个模型价格
          </div>
        </div>

        <div className={styles.actions}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="搜索模型..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditingRule(null);
              setModalOpen(true);
            }}
          >
            手动添加
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={resetToDefaults}
          >
            同步价格
          </Button>
        </div>
      </div>

      {/* Rules Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>模型</th>
              <th>请求数</th>
              <th>Token</th>
              <th>预估成本</th>
              <th>输入价 ($/1M)</th>
              <th>输出价 ($/1M)</th>
              <th>缓存读取 ($/1M)</th>
              <th>缓存创建 ($/1M)</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.map((rule) => {
              const stats = modelStatsMap.get(rule.displayName) || modelStatsMap.get(rule.modelPattern);
              const reqCount = stats ? stats.requests : 0;
              const tokenCount = stats ? stats.tokens : 0;
              const cost = stats ? stats.cost : 0;

              return (
                <tr key={rule.modelPattern}>
                  <td>
                    <div className={styles.modelNameCell}>
                      <span className={styles.modelName}>{rule.displayName || rule.modelPattern}</span>
                      <span className={styles.modelPat}>{rule.modelPattern}</span>
                    </div>
                  </td>
                  <td className={styles.numCell}>{reqCount > 0 ? reqCount.toLocaleString() : '—'}</td>
                  <td className={styles.numCell}>{tokenCount > 0 ? formatCompactNumber(tokenCount) : '—'}</td>
                  <td className={styles.numCellHighlight}>
                    {cost > 0 ? `$${cost.toFixed(3)}` : reqCount > 0 ? '$0.00' : '—'}
                  </td>
                  <td className={styles.priceCell}>${rule.inputPricePerMillion.toFixed(4)}</td>
                  <td className={styles.priceCell}>${rule.outputPricePerMillion.toFixed(4)}</td>
                  <td className={styles.priceCell}>
                    ${(rule.cacheReadPricePerMillion ?? rule.inputPricePerMillion * 0.1).toFixed(4)}
                  </td>
                  <td className={styles.priceCell}>
                    ${(rule.cacheWritePricePerMillion ?? rule.inputPricePerMillion * 1.25).toFixed(4)}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => {
                          setEditingRule(rule);
                          setModalOpen(true);
                        }}
                        title="编辑"
                      >
                        ✏️
                      </button>
                      {rule.isCustom && (
                        <button
                          type="button"
                          className={styles.delBtn}
                          onClick={() => deleteRule(rule.modelPattern)}
                          title="删除自定义规则"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ModelPricingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialRule={editingRule}
        onSave={addRule}
      />
    </div>
  );
}
