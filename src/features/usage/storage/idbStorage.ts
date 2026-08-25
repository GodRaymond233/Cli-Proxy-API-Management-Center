import type { UsageRecord, UsageFilterParams } from '@/types/usage';

const DB_NAME = 'cpamc_usage_database';
const DB_VERSION = 1;
const STORE_RECORDS = 'usage_records';

export class UsageDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private isSupported(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.isSupported()) {
      return Promise.reject(new Error('IndexedDB is not supported in this environment'));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_RECORDS)) {
          const store = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('model', 'model', { unique: false });
          store.createIndex('provider', 'provider', { unique: false });
          store.createIndex('statusCode', 'statusCode', { unique: false });
          store.createIndex('requestId', 'requestId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  async addRecords(records: UsageRecord[]): Promise<void> {
    if (!records.length) return;
    try {
      const db = await this.open();
      const tx = db.transaction(STORE_RECORDS, 'readwrite');
      const store = tx.objectStore(STORE_RECORDS);

      for (const record of records) {
        store.put(record);
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Fallback in memory or localStorage if IDB fails
      this.fallbackSave(records);
    }
  }

  async queryRecords(filter: UsageFilterParams): Promise<UsageRecord[]> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_RECORDS, 'readonly');
        const store = tx.objectStore(STORE_RECORDS);
        const index = store.index('timestamp');

        const { startTime, endTime } = filter.timeRange;
        let range: IDBKeyRange | undefined;
        if (startTime && endTime) {
          range = IDBKeyRange.bound(startTime, endTime);
        } else if (startTime) {
          range = IDBKeyRange.lowerBound(startTime);
        } else if (endTime) {
          range = IDBKeyRange.upperBound(endTime);
        }

        const request = range ? index.getAll(range) : store.getAll();

        request.onsuccess = () => {
          let results = (request.result as UsageRecord[]) || [];

          if (filter.model) {
            results = results.filter((r) => r.model === filter.model);
          }
          if (filter.provider) {
            results = results.filter((r) => r.provider === filter.provider);
          }
          if (filter.statusCodeGroup && filter.statusCodeGroup !== 'all') {
            const prefix = filter.statusCodeGroup[0];
            results = results.filter((r) => String(r.statusCode).startsWith(prefix));
          }
          if (filter.keyName) {
            results = results.filter((r) => r.keyName === filter.keyName);
          }
          if (filter.searchQuery) {
            const q = filter.searchQuery.toLowerCase().trim();
            results = results.filter(
              (r) =>
                r.requestId?.toLowerCase().includes(q) ||
                r.model?.toLowerCase().includes(q) ||
                r.provider?.toLowerCase().includes(q) ||
                r.sourceIp?.toLowerCase().includes(q) ||
                r.keyName?.toLowerCase().includes(q) ||
                r.endpoint?.toLowerCase().includes(q)
            );
          }

          results.sort((a, b) => b.timestamp - a.timestamp);
          resolve(results);
        };

        request.onerror = () => reject(request.error);
      });
    } catch {
      return this.fallbackQuery(filter);
    }
  }

  async countRecords(): Promise<number> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_RECORDS, 'readonly');
        const store = tx.objectStore(STORE_RECORDS);
        const countRequest = store.count();
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error);
      });
    } catch {
      return this.fallbackCount();
    }
  }

  async clearAllRecords(): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(STORE_RECORDS, 'readwrite');
      tx.objectStore(STORE_RECORDS).clear();
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      localStorage.removeItem('cpamc_usage_fallback_records');
    }
  }

  // LocalStorage Fallback Mechanisms
  private fallbackSave(records: UsageRecord[]): void {
    try {
      const existingStr = localStorage.getItem('cpamc_usage_fallback_records') || '[]';
      const existing: UsageRecord[] = JSON.parse(existingStr);
      const map = new Map<string, UsageRecord>();
      existing.forEach((r) => map.set(r.id, r));
      records.forEach((r) => map.set(r.id, r));
      const merged = Array.from(map.values()).slice(-2000);
      localStorage.setItem('cpamc_usage_fallback_records', JSON.stringify(merged));
    } catch {
      // Ignored
    }
  }

  private fallbackQuery(filter: UsageFilterParams): UsageRecord[] {
    try {
      const existingStr = localStorage.getItem('cpamc_usage_fallback_records') || '[]';
      let results: UsageRecord[] = JSON.parse(existingStr);

      const { startTime, endTime } = filter.timeRange;
      if (startTime) {
        results = results.filter((r) => r.timestamp >= startTime);
      }
      if (endTime) {
        results = results.filter((r) => r.timestamp <= endTime);
      }
      if (filter.model) {
        results = results.filter((r) => r.model === filter.model);
      }
      if (filter.provider) {
        results = results.filter((r) => r.provider === filter.provider);
      }
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase().trim();
        results = results.filter(
          (r) =>
            r.requestId?.toLowerCase().includes(q) ||
            r.model?.toLowerCase().includes(q) ||
            r.keyName?.toLowerCase().includes(q)
        );
      }

      results.sort((a, b) => b.timestamp - a.timestamp);
      return results;
    } catch {
      return [];
    }
  }

  private fallbackCount(): number {
    try {
      const existingStr = localStorage.getItem('cpamc_usage_fallback_records') || '[]';
      return JSON.parse(existingStr).length;
    } catch {
      return 0;
    }
  }
}

export const usageDb = new UsageDatabase();
