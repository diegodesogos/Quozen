
import { UserSettings, GroupData, SchemaType } from "./types";

/**
 * Low-level interface for storage operations.
 * Decoupled from business logic (validations, migrations, complex updates).
 */
export interface IStorageAdapter {
    // --- Settings ---
    loadSettings(userEmail: string): Promise<UserSettings | null>;
    saveSettings(userEmail: string, settings: UserSettings): Promise<void>;

    // --- File Operations ---
    /**
     * Creates a new spreadsheet-like file with the given sheets.
     * Returns the file ID.
     */
    createFile(name: string, sheetNames: string[]): Promise<string>;

    deleteFile(fileId: string): Promise<void>;

    renameFile(fileId: string, newName: string): Promise<void>;

    /**
     * Shares file with email, returns display name if available.
     */
    shareFile(fileId: string, email: string, role: "writer" | "reader"): Promise<string | null>;

    /**
     * Generic search for files (used for reconciliation).
     * Returns minimal metadata.
     */
    listFiles(queryPrefix: string): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any }>>;

    // --- content Operations ---

    /**
     * Returns rudimentary metadata (title, sheet names) for validation.
     */
    getFileMeta(fileId: string): Promise<{ title: string; sheetNames: string[] }>;

    /**
     * Reads all data from the group file.
     */
    readGroupData(fileId: string): Promise<GroupData | null>;

    /**
     * Overwrites or initializes the group data in bulk.
     * Used during creation to set initial state efficiently.
     */
    initializeGroup(fileId: string, data: GroupData): Promise<void>;

    // --- Row Operations ---

    appendRow(fileId: string, sheetName: SchemaType, data: any): Promise<void>;

    updateRow(fileId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void>;

    deleteRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<void>;

    /**
     * Reads a specific row. Useful for conflict checking.
     */
    readRow(fileId: string, sheetName: SchemaType, rowIndex: number): Promise<any | null>;

    /**
     * Initialize connection / cache if necessary
     */
    initialize?(): Promise<void>;
}
