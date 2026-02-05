
import { IStorageAdapter } from "./adapter";
import { UserSettings, GroupData, SchemaType, Expense, Settlement, Member } from "./types";

interface MockSheet {
    name: string;
    expenses: Expense[];
    settlements: Settlement[];
    members: Member[];
    createdTime: string;
}

export class InMemoryAdapter implements IStorageAdapter {
    private sheets: Map<string, MockSheet> = new Map();
    private userSettings: Map<string, UserSettings> = new Map();

    constructor() {
        console.log("[MemoryAdapter] Initialized.");
    }

    // --- Settings ---

    async loadSettings(userEmail: string): Promise<UserSettings | null> {
        return this.userSettings.get(userEmail) || null;
    }

    async saveSettings(userEmail: string, settings: UserSettings): Promise<void> {
        // If userEmail is provided, use it.
        // If not (legacy issue), try to find where this settings object belongs? 
        // Or simplistic assumption: In memory provider, we might just store by email.
        if (userEmail) {
            this.userSettings.set(userEmail, settings);
        } else {
            // Fallback: If we don't have email, we can't save to a specific user.
            // But StorageService calls with "" sometimes?
            // Actually, StorageService.saveSettings tries `adapter.saveSettings("", settings)`.
            // This WILL FAIL for InMemoryAdapter if we don't handle it.
            // Hack: Update ALL settings that match? Or throw?
            // Ideally we fix StorageService to pass email.

            // BUT, for tests (MemoryProvider usage), we rely on `user.email`.
            // Let's assume for Memory adapter we MIGHT save to "default" if single user?
            if (this.userSettings.size === 1) {
                const key = this.userSettings.keys().next().value;
                if (key) this.userSettings.set(key, settings);
            } else {
                console.warn("[MemoryAdapter] Cannot save settings without email and multiple users exist.");
            }
        }
    }

    // --- File Operations ---

    async createFile(name: string, sheetNames: string[]): Promise<string> {
        const id = "mock-sheet-" + self.crypto.randomUUID();
        this.sheets.set(id, {
            name,
            expenses: [],
            settlements: [],
            members: [],
            createdTime: new Date().toISOString()
        });
        return id;
    }

    async deleteFile(fileId: string): Promise<void> {
        this.sheets.delete(fileId);
    }

    async renameFile(fileId: string, newName: string): Promise<void> {
        const sheet = this.sheets.get(fileId);
        if (sheet) sheet.name = newName;
    }

    async shareFile(fileId: string, email: string, role: "writer" | "reader"): Promise<string | null> {
        // Mocking behavior: verification not needed
        return email;
    }

    async listFiles(queryPrefix: string): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any }>> {
        const files: any[] = [];
        for (const [id, sheet] of this.sheets.entries()) {
            if (sheet.name.includes(queryPrefix.replace("name contains '", "").replace("'", ""))) { // approximate check
                files.push({
                    id,
                    name: sheet.name,
                    createdTime: sheet.createdTime,
                    owners: [], // Mock doesn't track owners
                    capabilities: { canDelete: true }
                });
            }
        }
        return files;
    }

    async getFileMeta(fileId: string): Promise<{ title: string; sheetNames: string[] }> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) throw new Error("File not found");
        return {
            title: sheet.name,
            sheetNames: ["Expenses", "Settlements", "Members"]
        };
    }

    // --- Data Operations ---

    async readGroupData(fileId: string): Promise<GroupData | null> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) return null;
        // Search needs deep copy to simulate network fetch?
        return JSON.parse(JSON.stringify(sheet));
    }

    async initializeGroup(fileId: string, data: GroupData): Promise<void> {
        const sheet = this.sheets.get(fileId);
        if (sheet) {
            sheet.expenses = data.expenses;
            sheet.settlements = data.settlements;
            sheet.members = data.members;
        }
    }

    // --- Row Operations ---

    async appendRow(fileId: string, sheetName: SchemaType, data: any): Promise<void> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) throw new Error("Sheet not found");

        const collection = this.getCollection(sheet, sheetName);
        const rowIndex = collection.length + 2; // +2 for Header + 1-based index?
        // Actually, rowIndex should be collection.length + 2 (Header row is 1).

        // Ensure meta/rowIndex are set?
        // Google Drive implementation doesn't return the row. The caller sets ID/Meta.
        // But _rowIndex needs to be derived.
        // Wait, `readGroupData` assigns `_rowIndex`.
        // So here we should push the data.
        collection.push({ ...data, _rowIndex: rowIndex });
    }

    async updateRow(fileId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) throw new Error("Sheet not found");

        const collection = this.getCollection(sheet, sheetName);
        // We find by rowIndex? Memory provider implementation mapped 1-to-1.
        // But if we deleted rows, indices shift.
        // Google Sheets API handles shifting.
        // Our Mock should allow random access by index if it simulates Sheets?
        // If we use `splice` for delete, indices shift.
        // `readGroupData` recalculates indices based on position.

        // So `rowIndex` argument means "Position in array + 2".
        const arrayIndex = rowIndex - 2;
        if (arrayIndex >= 0 && arrayIndex < collection.length) {
            collection[arrayIndex] = { ...collection[arrayIndex], ...data };
        }
    }

    async deleteRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) throw new Error("Sheet not found");
        const collection = this.getCollection(sheet, sheetName);
        const arrayIndex = rowIndex - 2;
        if (arrayIndex >= 0 && arrayIndex < collection.length) {
            collection.splice(arrayIndex, 1);
        }
    }

    async readRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<any | null> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) return null;
        const collection = this.getCollection(sheet, sheetName);
        const arrayIndex = rowIndex - 2;
        return collection[arrayIndex] || null;
    }

    private getCollection(sheet: MockSheet, sheetName: SchemaType): any[] {
        if (sheetName === 'Expenses') return sheet.expenses;
        if (sheetName === 'Settlements') return sheet.settlements;
        return sheet.members;
    }
}
