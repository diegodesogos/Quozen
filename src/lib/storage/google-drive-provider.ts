import { IStorageProvider, Group, User, GroupData, SCHEMAS, SchemaType, MemberInput, Member } from "./types";
import { getAuthToken } from "../tokenStore";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";

/** Naming convention for Quozen spreadsheets */
export const QUOZEN_PREFIX = "Quozen - ";

/** Required sheet tabs for a valid Quozen spreadsheet */
export const REQUIRED_SHEETS = ["Expenses", "Settlements", "Members"] as const;

export class GoogleDriveProvider implements IStorageProvider {
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
            if (response.status === 403) {
                throw new Error("Permission denied (403). You may not have access to this file.");
            }
            const errorBody = await response.text();
            throw new Error(`Google API Error: ${response.status} - ${errorBody}`);
        }

        return response;
    }

    private async shareFile(fileId: string, email: string): Promise<string> {
        try {
            const res = await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
                method: "POST",
                body: JSON.stringify({
                    role: "writer",
                    type: "user",
                    emailAddress: email
                })
            });
            const data = await res.json();
            return data.displayName || email;
        } catch (e) {
            console.error(`Failed to share with ${email}`, e);
            return email; // Fallback to email if sharing fails or name unavailable
        }
    }

    async listGroups(): Promise<Group[]> {
        const query = `mimeType = 'application/vnd.google-apps.spreadsheet' and name contains '${QUOZEN_PREFIX}' and trashed = false`;
        const fields = "files(id, name, createdTime)";

        const response = await this.fetchWithAuth(
            `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`
        );

        const data = await response.json();

        // Filter to only files that start with prefix (contains is case-insensitive)
        const quozenFiles = (data.files || []).filter((file: any) =>
            file.name.startsWith(QUOZEN_PREFIX)
        );

        return quozenFiles.map((file: any) => ({
            id: file.id,
            name: file.name.slice(QUOZEN_PREFIX.length),
            description: "Google Sheet Group",
            createdBy: "me",
            participants: [],
            createdAt: file.createdTime
        }));
    }

    async createGroupSheet(name: string, user: User, members: MemberInput[] = []): Promise<Group> {
        const title = `${QUOZEN_PREFIX}${name}`;

        // 1. Create Spreadsheet
        const createRes = await this.fetchWithAuth(SHEETS_API_URL, {
            method: "POST",
            body: JSON.stringify({
                properties: { title },
                sheets: [
                    { properties: { title: "Expenses", gridProperties: { frozenRowCount: 1 } } },
                    { properties: { title: "Settlements", gridProperties: { frozenRowCount: 1 } } },
                    { properties: { title: "Members", gridProperties: { frozenRowCount: 1 } } }
                ]
            })
        });

        const sheetFile = await createRes.json();
        const spreadsheetId = sheetFile.spreadsheetId;

        // 2. Process Initial Members
        const initialMembersRows = [];

        // Add current user (Admin)
        initialMembersRows.push([user.id, user.email, user.name, "admin", new Date().toISOString()]);

        // Add additional members
        for (const member of members) {
            let memberName = member.username || member.email || "Unknown";
            let memberId = member.email || member.username || `user-${self.crypto.randomUUID()}`;

            if (member.email) {
                // If valid email, try to share and get real name
                const displayName = await this.shareFile(spreadsheetId, member.email);
                if (displayName) memberName = displayName;
                memberId = member.email; // Use email as ID for shared users
            }

            initialMembersRows.push([memberId, member.email || "", memberName, "member", new Date().toISOString()]);
        }

        // 3. Write Headers and Data
        const valuesBody = {
            valueInputOption: "USER_ENTERED",
            data: [
                { range: "Expenses!A1", values: [SCHEMAS.Expenses] },
                { range: "Settlements!A1", values: [SCHEMAS.Settlements] },
                { range: "Members!A1", values: [SCHEMAS.Members] },
                { range: "Members!A2", values: initialMembersRows }
            ]
        };

        await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}/values:batchUpdate`, {
            method: "POST",
            body: JSON.stringify(valuesBody)
        });

        return {
            id: spreadsheetId,
            name: name,
            description: "Google Sheet Group",
            createdBy: "me",
            participants: initialMembersRows.map(row => row[0]),
            createdAt: new Date().toISOString()
        };
    }

    async updateGroup(groupId: string, name: string, members: MemberInput[]): Promise<void> {
        // 1. Rename file if needed
        const newTitle = `${QUOZEN_PREFIX}${name}`;
        // We always update the name to ensure it matches, minimal overhead
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${groupId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: newTitle })
        });

        // 2. Fetch current members
        const groupData = await this.getGroupData(groupId);
        if (!groupData) throw new Error("Group not found");
        const currentMembers = groupData.members;

        // 3. Diff members
        const currentMemberIds = new Set(currentMembers.map(m => m.userId));

        // Members to keep or add
        const updatedMembersRows: any[] = [];
        const keptMemberIds = new Set<string>();

        // Note: We always preserve the first admin (creator) or anyone marked as admin if they aren't in the list?
        // Logic: The input `members` list from UI is the *desired* state.
        // However, we must ensure we don't accidentally remove the current user if the UI didn't pass them.
        // NOTE: The UI should pass ALL members including the current user.

        // For existing members, we keep their row data (joinedAt, role, etc)
        // For new members, we add them.

        // Helper to normalize input
        const desiredMembers = members.map(m => ({
            id: m.email || m.username || "",
            ...m
        })).filter(m => m.id);

        const processedIds = new Set<string>();

        for (const desired of desiredMembers) {
            // Check if exists
            const existing = currentMembers.find(c =>
                (desired.email && c.email === desired.email) ||
                (desired.username && c.userId === desired.username)
            );

            if (existing) {
                // Keep existing row, maybe update name if needed? For now just keep.
                // We don't write to the sheet here, we will reconstruct the sheet or append/delete.
                // Actually, deleting specific rows in Sheets is hard because indices shift.
                // STRATEGY: 
                // 1. Identify rows to DELETE (members not in desired list)
                // 2. Identify rows to APPEND (new members)
                processedIds.add(existing.userId);
            } else {
                // New Member
                let memberName = desired.username || desired.email || "Unknown";
                let memberId = desired.email || desired.username || `user-${self.crypto.randomUUID()}`;

                if (desired.email) {
                    const displayName = await this.shareFile(groupId, desired.email);
                    if (displayName) memberName = displayName;
                    memberId = desired.email;
                }

                // Add to sheet
                await this.addRow(groupId, "Members", {
                    userId: memberId,
                    email: desired.email || "",
                    name: memberName,
                    role: "member",
                    joinedAt: new Date().toISOString()
                });
                processedIds.add(memberId);
            }
        }

        // 4. Remove members not in the processed list
        // We iterate backwards to avoid index shift issues affecting subsequent deletions
        // Filter out admins from deletion to prevent locking oneself out
        const membersToDelete = currentMembers
            .filter(m => !processedIds.has(m.userId) && m.role !== 'admin')
            .sort((a, b) => (b._rowIndex || 0) - (a._rowIndex || 0));

        for (const member of membersToDelete) {
            if (member._rowIndex) {
                await this.deleteRow(groupId, "Members", member._rowIndex);
                // Attempt to revoke permission if email exists
                // Note: This requires getting permissionId first. Skipping for MVP iteration 
                // as it adds significant API complexity/latency. Removing from list denies app access.
            }
        }
    }

    async checkMemberHasExpenses(groupId: string, userId: string): Promise<boolean> {
        const data = await this.getGroupData(groupId);
        if (!data) return false;

        return data.expenses.some(e => {
            // Did they pay?
            if (e.paidBy === userId) return true;
            // Are they part of the split with > 0 amount?
            if (e.splits && e.splits.some((s: any) => s.userId === userId && s.amount > 0)) return true;
            return false;
        });
    }

    /**
     * Validates that a spreadsheet has the correct Quozen structure
     * @param spreadsheetId The spreadsheet ID to validate
     * @param userEmail The current user's email to check membership
     * @returns Validation result with success status and error message if failed
     */
    async validateQuozenSpreadsheet(
        spreadsheetId: string,
        userEmail: string
    ): Promise<{ valid: boolean; error?: string; name?: string }> {
        try {
            // 1. Fetch spreadsheet metadata to check tabs and name
            const metadataRes = await this.fetchWithAuth(
                `${SHEETS_API_URL}/${spreadsheetId}?fields=properties.title,sheets.properties.title`
            );
            const metadata = await metadataRes.json();
            const sheetName = metadata.properties?.title || "";
            const sheetTitles = metadata.sheets?.map((s: any) => s.properties.title) || [];

            // 2. Validate name starts with Quozen prefix
            if (!sheetName.startsWith(QUOZEN_PREFIX)) {
                return {
                    valid: false,
                    error: `Invalid file: must be a Quozen group (name should start with "${QUOZEN_PREFIX}")`
                };
            }

            // 3. Validate required sheets exist
            const missingSheets = REQUIRED_SHEETS.filter(
                (required) => !sheetTitles.includes(required)
            );
            if (missingSheets.length > 0) {
                return {
                    valid: false,
                    error: `Invalid structure: missing tabs: ${missingSheets.join(", ")}`
                };
            }

            // 4. Check if current user is a member
            const membersRes = await this.fetchWithAuth(
                `${SHEETS_API_URL}/${spreadsheetId}/values/Members!A2:E`
            );
            const membersData = await membersRes.json();
            const members = membersData.values || [];

            // Members schema: [userId, email, name, role, joinedAt]
            const userIsMember = members.some((row: string[]) => row[1] === userEmail);

            if (!userIsMember) {
                return {
                    valid: false,
                    error: "Access denied: you are not a member of this group"
                };
            }

            return {
                valid: true,
                name: sheetName.slice(QUOZEN_PREFIX.length)
            };
        } catch (error: any) {
            if (error.message?.includes("403")) {
                return {
                    valid: false,
                    error: "Access denied: you don't have permission to access this file"
                };
            }
            if (error.message?.includes("404")) {
                return {
                    valid: false,
                    error: "File not found"
                };
            }
            return {
                valid: false,
                error: `Validation failed: ${error.message || "Unknown error"}`
            };
        }
    }

    async getGroupData(spreadsheetId: string): Promise<GroupData | null> {
        if (!spreadsheetId) return null;

        const ranges = ["Expenses!A2:Z", "Settlements!A2:Z", "Members!A2:Z"];
        const url = `${SHEETS_API_URL}/${spreadsheetId}/values:batchGet?majorDimension=ROWS&${ranges.map(r => `ranges=${r}`).join('&')}`;

        try {
            const res = await this.fetchWithAuth(url);
            const data = await res.json();
            const valueRanges = data.valueRanges;

            const mapRows = (rows: any[][], schema: readonly string[]) => {
                if (!rows) return [];
                return rows.map((row, i) => {
                    const obj: any = { _rowIndex: i + 2 };
                    schema.forEach((key, index) => {
                        let value = row[index];
                        if (key === 'splits' || key === 'meta') {
                            try { value = value ? JSON.parse(value) : []; } catch (e) { value = []; }
                        }
                        if (['amount'].includes(key) && value) { value = parseFloat(value); }
                        obj[key] = value;
                    });
                    return obj;
                });
            };

            return {
                expenses: mapRows(valueRanges[0].values, SCHEMAS.Expenses) as unknown as import("./types").Expense[],
                settlements: mapRows(valueRanges[1].values, SCHEMAS.Settlements) as unknown as import("./types").Settlement[],
                members: mapRows(valueRanges[2].values, SCHEMAS.Members) as unknown as import("./types").Member[],
            };
        } catch (e: any) {
            if (e.message && e.message.includes("404")) return null;
            throw e;
        }
    }

    private async addRow(spreadsheetId: string, sheetName: SchemaType, data: any) {
        const schema = SCHEMAS[sheetName];
        const rowValues = schema.map(key => {
            const val = data[key];
            return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : (val ?? "");
        });

        const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`;
        await this.fetchWithAuth(url, {
            method: "POST",
            body: JSON.stringify({ values: [rowValues] })
        });
    }

    async addExpense(spreadsheetId: string, expenseData: any): Promise<void> {
        const newExpense = {
            id: self.crypto.randomUUID(),
            ...expenseData,
            splits: expenseData.splits || [],
            meta: { createdAt: new Date().toISOString() }
        };
        return this.addRow(spreadsheetId, "Expenses", newExpense);
    }

    async deleteExpense(spreadsheetId: string, rowIndex: number): Promise<void> {
        return this.deleteRow(spreadsheetId, "Expenses", rowIndex);
    }

    async addSettlement(spreadsheetId: string, settlementData: any): Promise<void> {
        const newSettlement = {
            id: self.crypto.randomUUID(),
            ...settlementData,
            date: settlementData.date || new Date().toISOString()
        };
        return this.addRow(spreadsheetId, "Settlements", newSettlement);
    }

    async updateRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const schema = SCHEMAS[sheetName];
        const rowValues = schema.map(key => {
            const val = data[key];
            return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : (val ?? "");
        });

        const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`;
        await this.fetchWithAuth(url, {
            method: "PUT",
            body: JSON.stringify({ values: [rowValues] })
        });
    }

    async deleteRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        const sheetId = await this.getSheetId(spreadsheetId, sheetName);
        const body = {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: "ROWS",
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex
                    }
                }
            }]
        };

        await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}:batchUpdate`, {
            method: "POST",
            body: JSON.stringify(body)
        });
    }

    private sheetIdCache = new Map<string, number>();

    private async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
        const cacheKey = `${spreadsheetId}:${sheetName}`;
        if (this.sheetIdCache.has(cacheKey)) {
            return this.sheetIdCache.get(cacheKey)!;
        }

        const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}?fields=sheets.properties`);
        const data = await res.json();
        const sheet = data.sheets.find((s: any) => s.properties.title === sheetName);
        if (!sheet) throw new Error(`Sheet ${sheetName} not found`);

        const sheetId = sheet.properties.sheetId;
        this.sheetIdCache.set(cacheKey, sheetId);
        return sheetId;
    }
}
