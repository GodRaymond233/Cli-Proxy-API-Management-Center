import { useState, useEffect } from 'react';
import type { ModelPricingRule } from '@/types/usage';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import styles from './ModelPricingModal.module.scss';

interface ModelPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRule?: ModelPricingRule | null;
  onSave: (rule: Omit<ModelPricingRule, 'isCustom' | 'updatedAt'>) => void;
}

export function ModelPricingModal({
  isOpen,
  onClose,
  initialRule,
  onSave,
}: ModelPricingModalProps) {
  const [modelPattern, setModelPattern] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [inputPrice, setInputPrice] = useState('3.0');
  const [outputPrice, setOutputPrice] = useState('15.0');
  const [reasoningPrice, setReasoningPrice] = useState('15.0');
  const [cacheReadPrice, setCacheReadPrice] = useState('0.3');
  const [cacheWritePrice, setCacheWritePrice] = useState('3.75');

  useEffect(() => {
    if (initialRule) {
      setModelPattern(initialRule.modelPattern);
      setDisplayName(initialRule.displayName);
      setProvider(initialRule.provider);
      setInputPrice(String(initialRule.inputPricePerMillion));
      setOutputPrice(String(initialRule.outputPricePerMillion));
      setReasoningPrice(String(initialRule.reasoningPricePerMillion ?? initialRule.outputPricePerMillion));
      setCacheReadPrice(String(initialRule.cacheReadPricePerMillion ?? initialRule.inputPricePerMillion * 0.1));
      setCacheWritePrice(String(initialRule.cacheWritePricePerMillion ?? initialRule.inputPricePerMillion * 1.25));
    } else {
      setModelPattern('');
      setDisplayName('');
      setProvider('openai');
      setInputPrice('2.5');
      setOutputPrice('10.0');
      setReasoningPrice('10.0');
      setCacheReadPrice('1.25');
      setCacheWritePrice('2.5');
    }
  }, [initialRule, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelPattern.trim()) return;

    onSave({
      modelPattern: modelPattern.trim(),
      displayName: displayName.trim() || modelPattern.trim(),
      provider: provider.trim(),
      inputPricePerMillion: parseFloat(inputPrice) || 0,
      outputPricePerMillion: parseFloat(outputPrice) || 0,
      reasoningPricePerMillion: parseFloat(reasoningPrice) || 0,
      cacheReadPricePerMillion: parseFloat(cacheReadPrice) || 0,
      cacheWritePricePerMillion: parseFloat(cacheWritePrice) || 0,
    });
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={initialRule ? '编辑模型定价' : '添加自定义模型定价'}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.row}>
          <label className={styles.label}>模型匹配规则 (支持 * 通配符)</label>
          <Input
            value={modelPattern}
            onChange={(e) => setModelPattern(e.target.value)}
            placeholder="例如: gpt-4o*, claude-3-7*"
            required
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label}>展示名称</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例如: Claude 3.7 Sonnet"
          />
        </div>

        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label}>输入价 ($/1M)</label>
            <Input
              type="number"
              step="0.001"
              value={inputPrice}
              onChange={(e) => setInputPrice(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>输出价 ($/1M)</label>
            <Input
              type="number"
              step="0.001"
              value={outputPrice}
              onChange={(e) => setOutputPrice(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>思考推理价 ($/1M)</label>
            <Input
              type="number"
              step="0.001"
              value={reasoningPrice}
              onChange={(e) => setReasoningPrice(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>缓存读取 ($/1M)</label>
            <Input
              type="number"
              step="0.001"
              value={cacheReadPrice}
              onChange={(e) => setCacheReadPrice(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary">
            保存规则
          </Button>
        </div>
      </form>
    </Modal>
  );
}
