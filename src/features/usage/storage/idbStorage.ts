import type { UsageRecord, UsageFilterParams } from '@/types/usage';

const DB_NAME = 'cpamc_usage_database';
// v3: retain a connection scope and namespace each backfill cursor.
const DB_VERSION = 3;
const STORE_RECORDS = 'usage_records';
const STORE_SYNC_META = 'sync_meta';
const LEGACY_SCOPE_KEY = 'cpamc_usage_legacy_scope';

export interface UsageSyncMeta {
  /** 上次成功回填的窗口终点（ms） */
  lastSyncedAt?: number;
  /** 已回填覆盖的最早时间（ms） */
  oldestCoveredAt?: number;
  /** 上次回填尝试时间（ms），用于触发节流 */
  lastRunAt?: number;
  /** 深挖历史时插件里已无更早数据（避免每次触发继续空走） */
  historyExhausted?: boolean;
}

export class UsageDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly scope: string;
  private readonly legacyScope: string;

  constructor(scope = 'default') {
    this.scope = scope.trim() || 'default';
    this.legacyScope = this.readOrClaimLegacyScope();
  }

  private readOrClaimLegacyScope(): string {
    try {
      const existing = localStorage.getItem(LEGACY_SCOPE_KEY)?.trim();
      if (existing) return existing;
      localStorage.setItem(LEGACY_SCOPE_KEY, this.scope);
    } catch {
      // Test and restricted-storage environments have no durable marker.
    }
    return this.scope;
  }

  private syncMetaKey(): string {
    return `usage-plugin-backfill:${encodeURIComponent(this.scope)}`;
  }

  private fallbackRecordsKey(): string {
    return `cpamc_usage_fallback_records:${encodeURIComponent(this.scope)}`;
  }

  private fallbackSyncMetaKey(): string {
    return `cpamc_usage_sync_meta:${encodeURIComponent(this.scope)}`;
  }

  private belongsToScope(record: UsageRecord): boolean {
    return record.connectionScope === this.scope || (!record.connectionScope && this.legacyScope === this.scope);
  }

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
        const recordsStore = (event.target as IDBOpenDBRequest).transaction!.objectStore(
          STORE_RECORDS
        );
        if (!recordsStore.indexNames.contains('dedupKey')) {
          recordsStore.createIndex('dedupKey', 'dedupKey', { unique: false });
        }
        if (!recordsStore.indexNames.contains('connectionScope')) {
          recordsStore.createIndex('connectionScope', 'connectionScope', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SYNC_META)) {
          db.createObjectStore(STORE_SYNC_META, { keyPath: 'key' });
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
        store.put({ ...record, connectionScope: this.scope });
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
          let results = ((request.result as UsageRecord[]) || []).filter((record) =>
            this.belongsToScope(record)
          );

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
        const allRequest = store.getAll();
        allRequest.onsuccess = () =>
          resolve(
            ((allRequest.result as UsageRecord[]) || []).filter((record) => this.belongsToScope(record))
              .length
          );
        allRequest.onerror = () => reject(allRequest.error);
      });
    } catch {
      return this.fallbackCount();
    }
  }

  /**
   * 查询已存在的去重键 → { id, collectorSource }。供双通道采集在落库前
   * 做幂等判断（同一请求事件只保留一份，usage-queue 来源优先）。
   */
  async getExistingDedupEntries(
    keys: string[]
  ): Promise<Map<string, { id: string; collectorSource?: UsageRecord['collectorSource'] }>> {
    const found = new Map<string, { id: string; collectorSource?: UsageRecord['collectorSource'] }>();
    if (!keys.length) return found;
    try {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_RECORDS, 'readonly');
        const index = tx.objectStore(STORE_RECORDS).index('dedupKey');
        for (const key of keys) {
          const request = index.getAll(key);
          request.onsuccess = () => {
            const record = (request.result as UsageRecord[]).find((candidate) =>
              this.belongsToScope(candidate)
            );
            if (record && !found.has(key)) {
              found.set(key, { id: record.id, collectorSource: record.collectorSource });
            }
          };
        }
        tx.oncomplete = () => resolve(found);
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      return found;
    }
  }

  /** 本地最新记录时间戳（ms）；无记录返回 null。用于回填光标初始化。 */
  async getNewestRecordTimestamp(): Promise<number | null> {
    try {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_RECORDS, 'readonly');
        const index = tx.objectStore(STORE_RECORDS).index('timestamp');
        const request = index.openCursor(null, 'prev');
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(null);
            return;
          }
          if (this.belongsToScope(cursor.value as UsageRecord)) {
            resolve(cursor.key as number);
            return;
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async getSyncMeta(): Promise<UsageSyncMeta> {
    try {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SYNC_META, 'readonly');
        const request = tx.objectStore(STORE_SYNC_META).get(this.syncMetaKey());
        request.onsuccess = () => {
          const value = request.result as { key: string; meta: UsageSyncMeta } | undefined;
          resolve(value?.meta || {});
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      try {
        const raw = localStorage.getItem(this.fallbackSyncMetaKey());
        return raw ? (JSON.parse(raw) as UsageSyncMeta) : {};
      } catch {
        return {};
      }
    }
  }

  async setSyncMeta(meta: UsageSyncMeta): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(STORE_SYNC_META, 'readwrite');
      tx.objectStore(STORE_SYNC_META).put({ key: this.syncMetaKey(), meta });
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      try {
        localStorage.setItem(this.fallbackSyncMetaKey(), JSON.stringify(meta));
      } catch {
        // Ignored
      }
    }
  }

  async clearAllRecords(): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction([STORE_RECORDS, STORE_SYNC_META], 'readwrite');
      const records = tx.objectStore(STORE_RECORDS);
      const cursorRequest = records.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (this.belongsToScope(cursor.value as UsageRecord)) cursor.delete();
        cursor.continue();
      };
      // 清空当前连接的记录时同步重置当前连接的回填光标。
      tx.objectStore(STORE_SYNC_META).delete(this.syncMetaKey());
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      localStorage.removeItem(this.fallbackRecordsKey());
      localStorage.removeItem(this.fallbackSyncMetaKey());
    }
  }

  // LocalStorage Fallback Mechanisms
  private fallbackSave(records: UsageRecord[]): void {
    try {
      const existingStr = localStorage.getItem(this.fallbackRecordsKey()) || '[]';
      const existing: UsageRecord[] = JSON.parse(existingStr);
      const map = new Map<string, UsageRecord>();
      existing.forEach((r) => map.set(r.id, r));
      records.forEach((r) => map.set(r.id, r));
      const merged = Array.from(map.values()).slice(-2000);
      localStorage.setItem(this.fallbackRecordsKey(), JSON.stringify(merged));
    } catch {
      // Ignored
    }
  }

  private fallbackQuery(filter: UsageFilterParams): UsageRecord[] {
    try {
      const existingStr = localStorage.getItem(this.fallbackRecordsKey()) || '[]';
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
      const existingStr = localStorage.getItem(this.fallbackRecordsKey()) || '[]';
      return JSON.parse(existingStr).length;
    } catch {
      return 0;
    }
  }
}

export const usageDb = new UsageDatabase();
