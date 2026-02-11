import { IStorageAdapter } from "./adapter";
import { UserSettings, GroupData, SchemaType, Expense, Settlement, Member } from "./types";

interface MockSheet {
    name: string;
    sheetNames: string[]; // Added this field
    expenses: Expense[];
    settlements: Settlement[];
    members: Member[];
    createdTime: string;
    modifiedTime: string;
    content?: any;
    isPublic?: boolean;
    properties?: Record<string, string>;
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

        // Also save as a file for listFiles consistency if needed
        const settingsName = "quozen-settings.json";
        let existingId = Array.from(this.sheets.entries()).find(([_, s]) => s.name === settingsName)?.[0];
        if (!existingId) {
            existingId = "mock-settings-" + self.crypto.randomUUID();
            this.sheets.set(existingId, {
                name: settingsName,
                sheetNames: [],
                expenses: [],
                settlements: [],
                members: [],
                createdTime: new Date().toISOString(),
                modifiedTime: new Date().toISOString(),
                content: settings
            });
        } else {
            const sheet = this.sheets.get(existingId);
            if (sheet) sheet.content = settings;
        }
    }

    // --- File Operations ---

    async createFile(name: string, sheetNames: string[], properties?: Record<string, string>): Promise<string> {
        const id = "mock-sheet-" + self.crypto.randomUUID();
        this.sheets.set(id, {
            name,
            sheetNames, // Store the sheet names
            expenses: [],
            settlements: [],
            members: [],
            createdTime: new Date().toISOString(),
            modifiedTime: new Date().toISOString(),
            properties: properties || {}
        });
        return id;
    }

    async deleteFile(fileId: string): Promise<void> {
        this.sheets.delete(fileId);
    }

    async renameFile(fileId: string, newName: string): Promise<void> {
        const sheet = this.getAndTouch(fileId);
        if (sheet) sheet.name = newName;
    }

    async shareFile(fileId: string, email: string, role: "writer" | "reader"): Promise<string | null> {
        return email;
    }

    async setFilePermissions(fileId: string, access: 'public' | 'restricted'): Promise<void> {
        const sheet = this.getAndTouch(fileId);
        if (sheet) {
            sheet.isPublic = (access === 'public');
        }
    }

    async getFilePermissions(fileId: string): Promise<'public' | 'restricted'> {
        const sheet = this.sheets.get(fileId);
        return sheet?.isPublic ? 'public' : 'restricted';
    }

    async addFileProperties(fileId: string, properties: Record<string, string>): Promise<void> {
        const sheet = this.getAndTouch(fileId);
        if (sheet) {
            sheet.properties = { ...sheet.properties, ...properties };
        }
    }

    async listFiles(options: { nameContains?: string; properties?: Record<string, string> } = {}): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any, properties?: Record<string, string> }>> {
        const files: any[] = [];

        for (const [id, sheet] of this.sheets.entries()) {
            let match = true;

            if (options.properties) {
                // strict match for all provided properties
                for (const [key, value] of Object.entries(options.properties)) {
                    if (sheet.properties?.[key] !== value) {
                        match = false;
                        break;
                    }
                }
            } else if (options.nameContains) {
                // fallback to name search
                if (!sheet.name.includes(options.nameContains)) {
                    match = false;
                }
            }

            if (match) {
                files.push({
                    id,
                    name: sheet.name,
                    createdTime: sheet.createdTime,
                    owners: [],
                    capabilities: { canDelete: true },
                    properties: sheet.properties
                });
            }
        }
        return files;
    }

    async getLastModified(fileId: string): Promise<string> {
        const sheet = this.sheets.get(fileId);
        return sheet?.modifiedTime || new Date().toISOString();
    }

    async getFileMeta(fileId: string): Promise<{ title: string; sheetNames: string[]; properties?: Record<string, string> }> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) throw new Error("File not found");
        return {
            title: sheet.name,
            sheetNames: sheet.sheetNames, // Return actual stored sheets
            properties: sheet.properties
        };
    }

    // --- Data Operations ---

    async readGroupData(fileId: string): Promise<GroupData | null> {
        const sheet = this.sheets.get(fileId);
        if (!sheet) return null;
        return JSON.parse(JSON.stringify(sheet));
    }

    async initializeGroup(fileId: string, data: GroupData): Promise<void> {
        const sheet = this.getAndTouch(fileId);
        if (sheet) {
            sheet.expenses = data.expenses;
            sheet.settlements = data.settlements;
            sheet.members = data.members;
        }
    }

    // --- Row Operations ---

    async appendRow(fileId: string, sheetName: SchemaType, data: any): Promise<void> {
        const sheet = this.getAndTouch(fileId);
        if (!sheet) throw new Error(`Sheet not found: ${fileId}`);

        const collection = this.getCollection(sheet, sheetName);
        const rowIndex = collection.length + 2;
        collection.push({ ...data, _rowIndex: rowIndex });
    }

    async updateRow(fileId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const sheet = this.getAndTouch(fileId);
        if (!sheet) throw new Error(`Sheet not found: ${fileId}`);

        const collection = this.getCollection(sheet, sheetName);
        const arrayIndex = rowIndex - 2;
        if (arrayIndex >= 0 && arrayIndex < collection.length) {
            collection[arrayIndex] = { ...collection[arrayIndex], ...data };
        }
    }

    async deleteRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        const sheet = this.getAndTouch(fileId);
        if (!sheet) throw new Error(`Sheet not found: ${fileId}`);
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

    private getAndTouch(fileId: string): MockSheet | undefined {
        const sheet = this.sheets.get(fileId);
        if (sheet) {
            sheet.modifiedTime = new Date().toISOString();
        }
        return sheet;
    }
}
