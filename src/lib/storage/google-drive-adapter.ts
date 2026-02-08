import { IStorageAdapter } from "./adapter";
import { UserSettings, GroupData, SchemaType, SCHEMAS, SETTINGS_FILE_NAME, QUOZEN_PREFIX } from "./types";
import { getAuthToken } from "../tokenStore";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";

export class GoogleDriveAdapter implements IStorageAdapter {
    // Map<UserEmail, FileId>
    private settingsFileIdCache = new Map<string, string>();
    private sheetIdCache = new Map<string, number>();

    constructor() {
        console.log("[DriveAdapter] Initialized.");
    }

    private async fetchWithAuth(url: string, options: RequestInit = {}) {
        const token = getAuthToken();
        if (!token) throw new Error("No access token found. Please sign in.");

        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Session expired (401). Please reload to sign in again.");
            }
            const errorBody = await response.text();
            throw new Error(`Google API Error ${response.status}: ${errorBody}`);
        }

        return response;
    }

    // --- Settings ---

    async loadSettings(userEmail: string): Promise<UserSettings | null> {
        try {
            const query = `name = '${SETTINGS_FILE_NAME}' and trashed = false`;
            const fields = "files(id, name, createdTime)";
            const listRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`);
            const listData = await listRes.json();

            if (listData.files && listData.files.length > 0) {
                let fileToUse = listData.files[0];
                if (listData.files.length > 1) {
                    const sortedFiles = listData.files.sort((a: any, b: any) => {
                        const timeA = new Date(a.createdTime || 0).getTime();
                        const timeB = new Date(b.createdTime || 0).getTime();
                        return (timeA - timeB) || (a.id || "").localeCompare(b.id || "");
                    });
                    fileToUse = sortedFiles[0];
                    for (const dup of sortedFiles.slice(1)) {
                        this.fetchWithAuth(`${DRIVE_API_URL}/files/${dup.id}`, { method: "DELETE" }).catch(() => { });
                    }
                }

                this.settingsFileIdCache.set(userEmail, fileToUse.id);
                const contentRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileToUse.id}?alt=media`);
                const settings = await contentRes.json();

                if (!settings.version) return null;
                return settings as UserSettings;
            } else {
                return null;
            }
        } catch (e: any) {
            console.error("Error loading settings", e);
            if (String(e).includes("401")) throw e;
            return null;
        }
    }

    async saveSettings(userEmail: string, settings: UserSettings): Promise<void> {
        settings.lastUpdated = new Date().toISOString();
        const content = JSON.stringify(settings, null, 2);

        let fileId = this.settingsFileIdCache.get(userEmail);
        if (!fileId) {
            const query = `name = '${SETTINGS_FILE_NAME}' and trashed = false`;
            const listRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}`);
            const listData = await listRes.json();
            if (listData.files?.[0]) {
                fileId = listData.files[0].id;
                if (fileId) this.settingsFileIdCache.set(userEmail, fileId);
            }
        }

        if (fileId) {
            await this.fetchWithAuth(`${DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=media`, {
                method: "PATCH",
                body: content
            });
        } else {
            const createRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files`, {
                method: "POST",
                body: JSON.stringify({ name: SETTINGS_FILE_NAME, mimeType: "application/json" })
            });
            const fileData = await createRes.json();
            this.settingsFileIdCache.set(userEmail, fileData.id);
            await this.fetchWithAuth(`${DRIVE_UPLOAD_URL}/files/${fileData.id}?uploadType=media`, {
                method: "PATCH",
                body: content
            });
        }
    }

    // --- File Operations ---

    async createFile(name: string, sheetNames: string[]): Promise<string> {
        const createRes = await this.fetchWithAuth(SHEETS_API_URL, {
            method: "POST",
            body: JSON.stringify({
                properties: { title: name },
                sheets: sheetNames.map(t => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } } }))
            })
        });
        const sheetFile = await createRes.json();
        return sheetFile.spreadsheetId;
    }

    async deleteFile(fileId: string): Promise<void> {
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}`, { method: "DELETE" });
    }

    async renameFile(fileId: string, newName: string): Promise<void> {
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: newName })
        });
    }

    async shareFile(fileId: string, email: string, role: "writer" | "reader"): Promise<string | null> {
        try {
            const res = await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
                method: "POST",
                body: JSON.stringify({
                    role: role,
                    type: "user",
                    emailAddress: email
                })
            });
            const data = await res.json();
            return data.displayName || email;
        } catch (e) {
            console.error(`Failed to share with ${email}`, e);
            return null;
        }
    }

    async setFilePermissions(fileId: string, access: 'public' | 'restricted'): Promise<void> {
        if (access === 'public') {
            await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
                method: "POST",
                body: JSON.stringify({
                    role: "writer", // Must be writer for expense sharing
                    type: "anyone"
                })
            });
        } else {
            // To set restricted, we must find the "anyone" permission and delete it
            const res = await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}/permissions`);
            const data = await res.json();
            const publicPerm = data.permissions?.find((p: any) => p.type === 'anyone');

            if (publicPerm) {
                await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}/permissions/${publicPerm.id}`, {
                    method: "DELETE"
                });
            }
        }
    }

    async listFiles(queryPrefix: string): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any }>> {
        const query = `mimeType = 'application/vnd.google-apps.spreadsheet' and name contains '${queryPrefix}' and trashed = false`;
        const fields = "files(id, name, createdTime, owners, capabilities)";
        const response = await this.fetchWithAuth(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`);
        const data = await response.json();
        return data.files || [];
    }

    async getFileMeta(fileId: string): Promise<{ title: string; sheetNames: string[] }> {
        const metaRes = await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}?fields=properties.title,sheets.properties.title`);
        const meta = await metaRes.json();
        const titles = meta.sheets?.map((s: any) => s.properties.title) || [];
        return { title: meta.properties?.title || "", sheetNames: titles };
    }

    // --- Data Operations ---

    async readGroupData(fileId: string): Promise<GroupData | null> {
        if (!fileId) return null;
        const ranges = ["Expenses", "Settlements", "Members"].map(s => `${s}!A2:Z`).join('&ranges=');
        try {
            const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values:batchGet?majorDimension=ROWS&ranges=${ranges}`);
            const data = await res.json();
            if (!data.valueRanges) return null;

            return {
                expenses: this.parseRows(data.valueRanges[0].values, SCHEMAS.Expenses),
                settlements: this.parseRows(data.valueRanges[1].values, SCHEMAS.Settlements),
                members: this.parseRows(data.valueRanges[2].values, SCHEMAS.Members)
            } as any;
        } catch { return null; }
    }

    async initializeGroup(fileId: string, data: GroupData): Promise<void> {
        const valuesBody = {
            valueInputOption: "USER_ENTERED",
            data: [
                { range: "Expenses!A1", values: [SCHEMAS.Expenses] },
                { range: "Settlements!A1", values: [SCHEMAS.Settlements] },
                { range: "Members!A1", values: [SCHEMAS.Members] },
                { range: "Members!A2", values: data.members.map(m => this.serializeRow(m, "Members")) }
            ]
        };
        if (data.expenses.length > 0) {
            valuesBody.data.push({ range: "Expenses!A2", values: data.expenses.map(e => this.serializeRow(e, "Expenses")) });
        }
        if (data.settlements.length > 0) {
            valuesBody.data.push({ range: "Settlements!A2", values: data.settlements.map(s => this.serializeRow(s, "Settlements")) });
        }

        await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values:batchUpdate`, {
            method: "POST",
            body: JSON.stringify(valuesBody)
        });
    }

    // --- Row Operations ---

    async appendRow(fileId: string, sheetName: SchemaType, data: any): Promise<void> {
        const row = this.serializeRow(data, sheetName);
        await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`, {
            method: "POST",
            body: JSON.stringify({ values: [row] })
        });
    }

    async updateRow(fileId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const row = this.serializeRow(data, sheetName);
        await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`, {
            method: "PUT",
            body: JSON.stringify({ values: [row] })
        });
    }

    async deleteRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        const sheetId = await this.getSheetId(fileId, sheetName);
        await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}:batchUpdate`, {
            method: "POST",
            body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } }] })
        });
    }

    async readRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<any | null> {
        const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}`);
        const data = await res.json();
        const row = data.values?.[0];
        if (!row) return null;

        const parsed = this.parseRows([row], SCHEMAS[sheetName], rowIndex);
        return parsed[0];
    }

    // --- Helpers ---

    private parseRows(rows: any[][], schema: readonly string[], startRowIndex: number = 2) {
        return (rows || []).map((row, i) => {
            const obj: any = { _rowIndex: startRowIndex + i };
            schema.forEach((key, idx) => {
                let val = row[idx];
                if (key === 'splits' || key === 'meta') {
                    try { val = JSON.parse(val); } catch { val = {}; }
                } else if (key === 'amount' && val) val = parseFloat(val);
                obj[key] = val;
            });
            return obj;
        });
    }

    private serializeRow(data: any, sheetName: SchemaType) {
        return SCHEMAS[sheetName].map(k => {
            const v = data[k];
            return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : (v ?? "");
        });
    }

    private async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
        const key = `${spreadsheetId}:${sheetName}`;
        if (this.sheetIdCache.has(key)) return this.sheetIdCache.get(key)!;
        const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}?fields=sheets.properties`);
        const data = await res.json();
        const sheet = data.sheets.find((s: any) => s.properties.title === sheetName);
        if (!sheet) throw new Error("Sheet not found");
        this.sheetIdCache.set(key, sheet.properties.sheetId);
        return sheet.properties.sheetId;
    }
}
