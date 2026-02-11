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

    /**
     * Forces a modification timestamp update on the Drive file by patching a metadata property.
     * This ensures auto-sync picks up changes immediately, as Sheets API edits can be lazily indexed.
     */
    private async touchFile(fileId: string): Promise<void> {
        try {
            await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    properties: {
                        _lastSyncTrigger: new Date().toISOString()
                    }
                })
            });
        } catch (e) {
            console.warn("[DriveAdapter] Failed to touch file timestamp. Auto-sync might be delayed.", e);
            // Non-blocking: don't fail the operation if this fails
        }
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

    async createFile(name: string, sheetNames: string[], properties?: Record<string, string>): Promise<string> {
        // 1. Create Spreadsheet via Sheets API
        const createRes = await this.fetchWithAuth(SHEETS_API_URL, {
            method: "POST",
            body: JSON.stringify({
                properties: { title: name },
                sheets: sheetNames.map(t => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } } }))
            })
        });
        const sheetFile = await createRes.json();
        const fileId = sheetFile.spreadsheetId;

        // 2. Add properties via Drive API if provided (Sheets API create doesn't support 'properties' field directly on Drive file)
        if (properties && fileId) {
            await this.addFileProperties(fileId, properties);
        }

        return fileId;
    }

    async deleteFile(fileId: string): Promise<void> {
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}`, { method: "DELETE" });
    }

    async renameFile(fileId: string, newName: string): Promise<void> {
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: newName })
        });
        await this.touchFile(fileId);
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
                    role: "writer",
                    type: "anyone"
                })
            });
        } else {
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

    async getFilePermissions(fileId: string): Promise<'public' | 'restricted'> {
        try {
            const res = await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}/permissions`);
            const data = await res.json();
            const publicPerm = data.permissions?.find((p: any) => p.type === 'anyone');
            return publicPerm ? 'public' : 'restricted';
        } catch (e) {
            console.error("Failed to get permissions", e);
            return 'restricted';
        }
    }

    async addFileProperties(fileId: string, properties: Record<string, string>): Promise<void> {
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}`, {
            method: "PATCH",
            body: JSON.stringify({ properties })
        });
    }

    async listFiles(options: { nameContains?: string; properties?: Record<string, string> } = {}): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any, properties?: Record<string, string> }>> {
        const clauses: string[] = ["mimeType = 'application/vnd.google-apps.spreadsheet'", "trashed = false"];

        if (options.properties) {
            Object.entries(options.properties).forEach(([key, value]) => {
                clauses.push(`properties has { key='${key}' and value='${value}' }`);
            });
        }

        if (options.nameContains && !options.properties) {
            clauses.push(`name contains '${options.nameContains}'`);
        }

        const query = clauses.join(" and ");
        const fields = "files(id, name, createdTime, owners, capabilities, properties)";

        try {
            const response = await this.fetchWithAuth(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`);
            const data = await response.json();
            return data.files || [];
        } catch (e) {
            console.error("List files error", e);
            return [];
        }
    }

    async getLastModified(fileId: string): Promise<string> {
        const res = await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}?fields=modifiedTime`, {
            cache: "no-store"
        });
        const data = await res.json();
        return data.modifiedTime || new Date().toISOString();
    }

    async getFileMeta(fileId: string): Promise<{ title: string; sheetNames: string[]; properties?: Record<string, string> }> {
        const driveResPromise = this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}?fields=name,properties`);
        const sheetsResPromise = this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}?fields=properties.title,sheets.properties.title`);

        const [driveRes, sheetsRes] = await Promise.all([driveResPromise, sheetsResPromise]);

        const driveData = await driveRes.json();
        const sheetsData = await sheetsRes.json();

        const titles = sheetsData.sheets?.map((s: any) => s.properties.title) || [];

        return {
            title: driveData.name || sheetsData.properties?.title || "",
            sheetNames: titles,
            properties: driveData.properties
        };
    }

    // --- Data Operations ---

    async readGroupData(fileId: string): Promise<GroupData | null> {
        if (!fileId) return null;
        const ranges = ["Expenses", "Settlements", "Members"].map(s => `${s}!A2:Z`).join('&ranges=');
        try {
            const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values:batchGet?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&ranges=${ranges}`);
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

        await this.touchFile(fileId);
    }

    // --- Row Operations ---

    async appendRow(fileId: string, sheetName: SchemaType, data: any): Promise<void> {
        const row = this.serializeRow(data, sheetName);
        await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`, {
            method: "POST",
            body: JSON.stringify({ values: [row] })
        });
        await this.touchFile(fileId);
    }

    async updateRow(fileId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const row = this.serializeRow(data, sheetName);
        await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`, {
            method: "PUT",
            body: JSON.stringify({ values: [row] })
        });
        await this.touchFile(fileId);
    }

    async deleteRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        const sheetId = await this.getSheetId(fileId, sheetName);
        await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}:batchUpdate`, {
            method: "POST",
            body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } }] })
        });
        await this.touchFile(fileId);
    }

    async readRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<any | null> {
        const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${fileId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}?valueRenderOption=UNFORMATTED_VALUE`);
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
                    try {
                        val = JSON.parse(val);
                    } catch {
                        val = key === 'splits' ? [] : {};
                    }
                } else if (key === 'amount') {
                    if (val !== undefined && val !== null && val !== "") {
                        val = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : parseFloat(String(val));
                    } else {
                        val = 0;
                    }
                    if (isNaN(val)) val = 0;
                }
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
