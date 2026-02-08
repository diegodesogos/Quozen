import { IStorageAdapter } from "./adapter";
import { UserSettings, GroupData, SchemaType } from "./types";
import { getAuthToken } from "../tokenStore";

const MOCK_API_BASE = "/_test/storage";

export class RemoteMockAdapter implements IStorageAdapter {
    constructor() {
        console.log("[RemoteMockAdapter] Initialized. Requests will be forwarded to " + MOCK_API_BASE);
    }

    private async fetch(path: string, options: RequestInit = {}) {
        const token = getAuthToken() || "mock-token";
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        };
        const res = await fetch(`${MOCK_API_BASE}${path}`, { ...options, headers });
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

    async createFile(name: string, sheetNames: string[]): Promise<string> {
        const res = await this.fetch(`/files`, {
            method: "POST",
            body: JSON.stringify({ name, sheetNames })
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

    async listFiles(queryPrefix: string): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any }>> {
        const res = await this.fetch(`/files?q=${encodeURIComponent(queryPrefix)}`);
        const data = await res.json();
        return data.files || [];
    }

    // --- Content / Data ---

    async getFileMeta(fileId: string): Promise<{ title: string; sheetNames: string[] }> {
        const res = await this.fetch(`/files/${fileId}/meta`);
        return await res.json();
    }

    async readGroupData(fileId: string): Promise<GroupData | null> {
        const res = await this.fetch(`/files/${fileId}/data`);
        const data = await res.json();
        return data.data || null; // API returns { data: ... } or null?
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
