import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModelPricingRule } from '@/types/usage';
import { DEFAULT_PRICING_RULES } from '../pricing/defaultPricing';

interface PricingState {
  customRules: ModelPricingRule[];
  addRule: (rule: Omit<ModelPricingRule, 'isCustom' | 'updatedAt'>) => void;
  updateRule: (pattern: string, rule: Partial<ModelPricingRule>) => void;
  deleteRule: (pattern: string) => void;
  resetToDefaults: () => void;
  getAllRules: () => ModelPricingRule[];
}

export const usePricingStore = create<PricingState>()(
  persist(
    (set, get) => ({
      customRules: [],

      addRule: (rule) => {
        set((state) => {
          const filtered = state.customRules.filter(
            (r) => r.modelPattern.toLowerCase() !== rule.modelPattern.toLowerCase()
          );
          const newRule: ModelPricingRule = {
            ...rule,
            isCustom: true,
            updatedAt: Date.now(),
          };
          return { customRules: [newRule, ...filtered] };
        });
      },

      updateRule: (pattern, patch) => {
        set((state) => ({
          customRules: state.customRules.map((r) =>
            r.modelPattern.toLowerCase() === pattern.toLowerCase()
              ? { ...r, ...patch, updatedAt: Date.now() }
              : r
          ),
        }));
      },

      deleteRule: (pattern) => {
        set((state) => ({
          customRules: state.customRules.filter(
            (r) => r.modelPattern.toLowerCase() !== pattern.toLowerCase()
          ),
        }));
      },

      resetToDefaults: () => {
        set({ customRules: [] });
      },

      getAllRules: () => {
        const custom = get().customRules;
        const customPatterns = new Set(custom.map((r) => r.modelPattern.toLowerCase()));
        const nonOverriddenDefaults = DEFAULT_PRICING_RULES.filter(
          (r) => !customPatterns.has(r.modelPattern.toLowerCase())
        );
        return [...custom, ...nonOverriddenDefaults];
      },
    }),
    {
      name: 'cpamc_custom_pricing_rules',
    }
  )
);
