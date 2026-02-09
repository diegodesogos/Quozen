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
    createFile(name: string, sheetNames: string[], properties?: Record<string, string>): Promise<string>;

    deleteFile(fileId: string): Promise<void>;

    renameFile(fileId: string, newName: string): Promise<void>;

    /**
     * Shares file with email, returns display name if available.
     */
    shareFile(fileId: string, email: string, role: "writer" | "reader"): Promise<string | null>;

    /**
     * Sets general access permissions for the file.
     * 'public' = Anyone with link can edit.
     * 'restricted' = Only added users can access.
     */
    setFilePermissions(fileId: string, access: 'public' | 'restricted'): Promise<void>;

    /**
     * Gets current file permissions to check if public.
     */
    getFilePermissions(fileId: string): Promise<'public' | 'restricted'>;

    /**
     * Adds public properties (metadata) to a file.
     */
    addFileProperties(fileId: string, properties: Record<string, string>): Promise<void>;

    /**
     * Generic search for files (used for reconciliation).
     * Returns minimal metadata.
     */
    listFiles(options?: { nameContains?: string; properties?: Record<string, string> }): Promise<Array<{ id: string, name: string, createdTime: string, owners: any[], capabilities: any, properties?: Record<string, string> }>>;

    /**
     * Gets the last modified timestamp of a file.
     */
    getLastModified(fileId: string): Promise<string>;

    // --- content Operations ---

    /**
     * Returns rudimentary metadata (title, sheet names, properties) for validation.
     */
    getFileMeta(fileId: string): Promise<{ title: string; sheetNames: string[]; properties?: Record<string, string> }>;

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
