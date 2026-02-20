import { IStorageLayer } from "./IStorageLayer";

interface CacheEntry {
    modifiedTime: string;
    data: any;
    fetchedAt: number;
}

export class StorageCacheProxy implements IStorageLayer {
    private cache = new Map<string, CacheEntry>();

    constructor(private delegate: IStorageLayer, private ttlMs: number = 60000) { }

    private invalidate(fileId: string) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(fileId)) {
                this.cache.delete(key);
            }
        }
    }

    async listFiles(query: string, fields?: string): Promise<any[]> {
        return this.delegate.listFiles(query, fields);
    }

    async getFile(fileId: string, options?: { alt?: string; fields?: string }): Promise<any> {
        return this.delegate.getFile(fileId, options);
    }

    async createFile(name: string, mimeType: string, properties?: Record<string, string>, content?: string): Promise<string> {
        return this.delegate.createFile(name, mimeType, properties, content);
    }

    async updateFile(fileId: string, metadata?: any, content?: string): Promise<any> {
        this.invalidate(fileId);
        return this.delegate.updateFile(fileId, metadata, content);
    }

    async deleteFile(fileId: string): Promise<void> {
        this.invalidate(fileId);
        return this.delegate.deleteFile(fileId);
    }

    async createPermission(fileId: string, role: string, type: string, emailAddress?: string): Promise<any> {
        return this.delegate.createPermission(fileId, role, type, emailAddress);
    }

    async listPermissions(fileId: string): Promise<any[]> {
        return this.delegate.listPermissions(fileId);
    }

    async deletePermission(fileId: string, permissionId: string): Promise<void> {
        return this.delegate.deletePermission(fileId, permissionId);
    }

    async createSpreadsheet(title: string, sheetTitles: string[], properties?: Record<string, string>): Promise<string> {
        return this.delegate.createSpreadsheet(title, sheetTitles, properties);
    }

    async getSpreadsheet(spreadsheetId: string, fields?: string): Promise<any> {
        return this.delegate.getSpreadsheet(spreadsheetId, fields);
    }

    async batchGetValues(spreadsheetId: string, ranges: string[]): Promise<any[]> {
        const cacheKey = `${spreadsheetId}:batchGetValues:${ranges.join(',')}`;
        const now = Date.now();
        const entry = this.cache.get(cacheKey);

        if (entry && (now - entry.fetchedAt < this.ttlMs)) {
            try {
                const meta = await this.delegate.getFile(spreadsheetId, { fields: 'modifiedTime' });
                const currentModifiedTime = meta?.modifiedTime || '';
                if (currentModifiedTime === entry.modifiedTime) {
                    return entry.data;
                }
            } catch (e) {
                // Ignore and fetch from source if metadata check fails
            }
        }

        const data = await this.delegate.batchGetValues(spreadsheetId, ranges);
        try {
            const meta = await this.delegate.getFile(spreadsheetId, { fields: 'modifiedTime' });
            this.cache.set(cacheKey, { modifiedTime: meta?.modifiedTime || '', data, fetchedAt: now });
        } catch (e) {
            this.cache.set(cacheKey, { modifiedTime: '', data, fetchedAt: now });
        }

        return data;
    }

    async batchUpdateValues(spreadsheetId: string, data: { range: string; values: any[][] }[]): Promise<void> {
        this.invalidate(spreadsheetId);
        return this.delegate.batchUpdateValues(spreadsheetId, data);
    }

    async appendValues(spreadsheetId: string, range: string, values: any[][]): Promise<void> {
        this.invalidate(spreadsheetId);
        return this.delegate.appendValues(spreadsheetId, range, values);
    }

    async updateValues(spreadsheetId: string, range: string, values: any[][]): Promise<void> {
        this.invalidate(spreadsheetId);
        return this.delegate.updateValues(spreadsheetId, range, values);
    }

    async batchUpdateSpreadsheet(spreadsheetId: string, requests: any[]): Promise<void> {
        this.invalidate(spreadsheetId);
        return this.delegate.batchUpdateSpreadsheet(spreadsheetId, requests);
    }
}
