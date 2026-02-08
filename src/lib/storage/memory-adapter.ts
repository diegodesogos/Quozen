import { IStorageAdapter } from "./adapter";
import { UserSettings, GroupData, SchemaType, Expense, Settlement, Member } from "./types";

interface MockSheet {
    name: string;
    expenses: Expense[];
    settlements: Settlement[];
    members: Member[];
    createdTime: string;
    content?: any;
    // New property for sharing test
    isPublic?: boolean;
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
        if (!userEmail) {
            console.warn("[MemoryAdapter] Cannot save settings without email.");
            return;
        }
        this.userSettings.set(userEmail, settings);

        const settingsName = "quozen-settings.json";
        let existingId = Array.from(this.sheets.entries()).find(([_, s]) => s.name === settingsName)?.[0];
        if (!existingId) {
            existingId = "mock-settings-" + self.crypto.randomUUID();
            this.sheets.set(existingId, {
                name: settingsName,
                expenses: [],
                settlements: [],
                members: [],
                createdTime: new Date().toISOString(),
                content: settings
            });
        } else {
            const sheet = this.sheets.get(existingId);
            if (sheet) sheet.content = settings;
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
        return email;
    }

    async setFilePermissions(fileId: string, access: 'public' | 'restricted'): Promise<void> {
        const sheet = this.sheets.get(fileId);
        if (sheet) {
            sheet.isPublic = (access === 'public');
        }
    }

    async getFilePermissions(fileId: string): Promise<'public' | 'restricted'> {
        const sheet = this.sheets.get(fileId);
        return sheet?.isPublic ? 'public' : 'restricted';
    }

    async listFiles(queryPrefix: string): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any }>> {
        const files: any[] = [];
        let nameFilter = "";
        let exact = false;

        const matchExact = queryPrefix.match(/name\s*=\s*'([^']+)'/);
        const matchContains = queryPrefix.match(/name\s*contains\s*'([^']+)'/);

        if (matchExact) {
            nameFilter = matchExact[1];
            exact = true;
        } else if (matchContains) {
            nameFilter = matchContains[1];
        } else {
            nameFilter = queryPrefix.replace("name contains '", "").replace("'", "");
        }

        for (const [id, sheet] of this.sheets.entries()) {
            const matches = exact
                ? sheet.name === nameFilter
                : sheet.name.includes(nameFilter);

            if (matches) {
                files.push({
                    id,
                    name: sheet.name,
                    createdTime: sheet.createdTime,
                    owners: [],
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
        const rowIndex = collection.length + 2;
        collection.push({ ...data, _rowIndex: rowIndex });
    }

    async updateRow(fileId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) throw new Error("Sheet not found");

        const collection = this.getCollection(sheet, sheetName);
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
