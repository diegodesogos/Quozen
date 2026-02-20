import { IStorageAdapter } from "./adapter";
import { IStorageLayer } from "../infrastructure/IStorageLayer";
import { UserSettings, GroupData, SchemaType } from "../types";

const MOCK_API_BASE = "/_test/storage";

export class RemoteMockAdapter implements IStorageAdapter, IStorageLayer {
    constructor(private getToken?: () => string | null) {
        console.log("[RemoteMockAdapter] Initialized. Requests will be forwarded to " + MOCK_API_BASE);
    }

    private async fetch(path: string, options: RequestInit = {}) {
        const token = (this.getToken ? this.getToken() : null) || "mock-token";
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        };
        const res = await (typeof fetch !== 'undefined' ? fetch(`${MOCK_API_BASE}${path}`, { ...options, headers }) : Promise.reject(new Error("fetch is not defined")));
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Mock API Error ${res.status}: ${body}`);
        }
        return res;
    }

    // --- Settings ---

    async loadSettings(userEmail: string): Promise<UserSettings | null> {
        const res = await this.fetch(`/settings?email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();
        return data.settings || null;
    }

    async saveSettings(userEmail: string, settings: UserSettings): Promise<void> {
        await this.fetch(`/settings`, {
            method: "POST",
            body: JSON.stringify({ email: userEmail, settings })
        });
    }

    // --- File Operations ---

    async createFile(name: string, sheetNames: string[], properties?: Record<string, string>): Promise<string> {
        const res = await this.fetch(`/files`, {
            method: "POST",
            body: JSON.stringify({ name, sheetNames, properties })
        });
        const data = await res.json();
        return data.id;
    }

    async deleteFile(fileId: string): Promise<void> {
        await this.fetch(`/files/${fileId}`, { method: "DELETE" });
    }

    async renameFile(fileId: string, newName: string): Promise<void> {
        await this.fetch(`/files/${fileId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: newName })
        });
    }

    async shareFile(fileId: string, email: string, role: "writer" | "reader"): Promise<string | null> {
        const res = await this.fetch(`/files/${fileId}/share`, {
            method: "POST",
            body: JSON.stringify({ email, role })
        });
        const data = await res.json();
        return data.displayName || null;
    }

    async setFilePermissions(fileId: string, access: 'public' | 'restricted'): Promise<void> {
        await this.fetch(`/files/${fileId}/permissions`, {
            method: "POST",
            body: JSON.stringify({ access })
        });
    }

    async getFilePermissions(fileId: string): Promise<'public' | 'restricted'> {
        const res = await this.fetch(`/files/${fileId}/permissions`, { method: "GET" });
        const data = await res.json();
        return data.access;
    }

    async addFileProperties(fileId: string, properties: Record<string, string>): Promise<void> {
        await this.fetch(`/files/${fileId}/properties`, {
            method: "POST",
            body: JSON.stringify({ properties })
        });
    }

    async listFiles(options: { nameContains?: string; properties?: Record<string, string> } = {}): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any, properties?: Record<string, string> }>> {
        // Encode options as JSON query param for simplicity in mock server
        const q = JSON.stringify(options);
        const res = await this.fetch(`/files?options=${encodeURIComponent(q)}`);
        const data = await res.json();
        return data.files || [];
    }

    async getLastModified(fileId: string): Promise<string> {
        const res = await this.fetch(`/files/${fileId}/modifiedTime`);
        const data = await res.json();
        return data.modifiedTime;
    }

    // --- IStorageLayer Additional Methods ---

    async getFile(fileId: string, options?: { alt?: string; fields?: string }): Promise<any> {
        const opts = encodeURIComponent(JSON.stringify(options || {}));
        const res = await this.fetch(`/files/${fileId}?options=${opts}`, { method: "GET" });
        return await res.json();
    }

    async updateFile(fileId: string, metadata?: any, content?: string): Promise<any> {
        const res = await this.fetch(`/files/${fileId}`, {
            method: "PATCH",
            body: JSON.stringify({ metadata, content })
        });
        return await res.json();
    }

    async createPermission(fileId: string, role: string, type: string, emailAddress?: string): Promise<any> {
        const res = await this.fetch(`/files/${fileId}/permissions`, {
            method: "POST",
            body: JSON.stringify({ role, type, emailAddress })
        });
        return await res.json();
    }

    async listPermissions(fileId: string): Promise<any[]> {
        const res = await this.fetch(`/files/${fileId}/permissions`, { method: "GET" });
        const data = await res.json();
        return data.permissions || [];
    }

    async deletePermission(fileId: string, permissionId: string): Promise<void> {
        await this.fetch(`/files/${fileId}/permissions/${permissionId}`, { method: "DELETE" });
    }

    async createSpreadsheet(title: string, sheetTitles: string[], properties?: Record<string, string>): Promise<string> {
        const res = await this.fetch(`/spreadsheets`, {
            method: "POST",
            body: JSON.stringify({ title, sheetTitles, properties })
        });
        const data = await res.json();
        return data.id;
    }

    async getSpreadsheet(spreadsheetId: string, fields?: string): Promise<any> {
        const f = encodeURIComponent(fields || '');
        const res = await this.fetch(`/spreadsheets/${spreadsheetId}?fields=${f}`, { method: "GET" });
        return await res.json();
    }

    async batchGetValues(spreadsheetId: string, ranges: string[]): Promise<any[]> {
        const r = encodeURIComponent(JSON.stringify(ranges));
        const res = await this.fetch(`/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${r}`, { method: "GET" });
        const data = await res.json();
        return data.valueRanges || [];
    }

    async batchUpdateValues(spreadsheetId: string, data: { range: string; values: any[][] }[]): Promise<void> {
        await this.fetch(`/spreadsheets/${spreadsheetId}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ data }) });
    }

    async appendValues(spreadsheetId: string, range: string, values: any[][]): Promise<void> {
        await this.fetch(`/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`, { method: "POST", body: JSON.stringify({ values }) });
    }

    async updateValues(spreadsheetId: string, range: string, values: any[][]): Promise<void> {
        await this.fetch(`/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, { method: "PUT", body: JSON.stringify({ values }) });
    }

    async batchUpdateSpreadsheet(spreadsheetId: string, requests: any[]): Promise<void> {
        await this.fetch(`/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
    }

    // --- Content / Data ---

    async getFileMeta(fileId: string): Promise<{ title: string; sheetNames: string[]; properties?: Record<string, string> }> {
        const res = await this.fetch(`/files/${fileId}/meta`);
        return await res.json();
    }

    async readGroupData(fileId: string): Promise<GroupData | null> {
        const res = await this.fetch(`/files/${fileId}/data`);
        const data = await res.json();
        return data.data || null;
    }

    async initializeGroup(fileId: string, data: GroupData): Promise<void> {
        await this.fetch(`/files/${fileId}/initialize`, {
            method: "POST",
            body: JSON.stringify(data)
        });
    }

    // --- Row Operations ---

    async appendRow(fileId: string, sheetName: SchemaType, data: any): Promise<void> {
        await this.fetch(`/files/${fileId}/rows/${sheetName}`, {
            method: "POST",
            body: JSON.stringify(data)
        });
    }

    async updateRow(fileId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        await this.fetch(`/files/${fileId}/rows/${sheetName}/${rowIndex}`, {
            method: "PUT",
            body: JSON.stringify(data)
        });
    }

    async deleteRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        await this.fetch(`/files/${fileId}/rows/${sheetName}/${rowIndex}`, {
            method: "DELETE"
        });
    }

    async readRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<any | null> {
        const res = await this.fetch(`/files/${fileId}/rows/${sheetName}/${rowIndex}`);
        const data = await res.json();
        return data.row || null;
    }
}
