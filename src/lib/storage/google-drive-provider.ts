import { IStorageProvider, Group, User, GroupData, SCHEMAS, SchemaType, MemberInput, Member, Expense } from "./types";
import { getAuthToken } from "../tokenStore";
import { ConflictError, NotFoundError } from "../errors";

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

    async listGroups(userEmail?: string): Promise<Group[]> {
        const query = `mimeType = 'application/vnd.google-apps.spreadsheet' and name contains '${QUOZEN_PREFIX}' and trashed = false`;
        const fields = "files(id, name, createdTime, owners, capabilities)";

        const response = await this.fetchWithAuth(
            `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`
        );

        const data = await response.json();

        const candidateFiles = (data.files || []).filter((file: any) =>
            file.name.startsWith(QUOZEN_PREFIX)
        );

        const validGroups: Group[] = [];

        await Promise.all(candidateFiles.map(async (file: any) => {
            try {
                if (userEmail) {
                    const validation = await this.validateQuozenSpreadsheet(file.id, userEmail);
                    if (!validation.valid) {
                        return; 
                    }
                }

                const isOwner = file.owners?.some((owner: any) => owner.emailAddress === userEmail) || file.capabilities?.canDelete;

                validGroups.push({
                    id: file.id,
                    name: file.name.slice(QUOZEN_PREFIX.length),
                    description: "Google Sheet Group",
                    createdBy: file.owners?.[0]?.displayName || "Unknown",
                    participants: [],
                    createdAt: file.createdTime,
                    isOwner: !!isOwner
                });
            } catch (e) {
                console.warn(`Skipping group file ${file.name} due to validation error`, e);
            }
        }));

        return validGroups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
        initialMembersRows.push([user.id, user.email, user.name, "admin", new Date().toISOString()]);

        for (const member of members) {
            let memberName = member.username || member.email || "Unknown";
            let memberId = member.email || member.username || `user-${self.crypto.randomUUID()}`;

            if (member.email) {
                const displayName = await this.shareFile(spreadsheetId, member.email);
                if (displayName) memberName = displayName;
                memberId = member.email;
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
            createdAt: new Date().toISOString(),
            isOwner: true
        };
    }

    async updateGroup(groupId: string, name: string, members: MemberInput[]): Promise<void> {
        const newTitle = `${QUOZEN_PREFIX}${name}`;
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${groupId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: newTitle })
        });

        const groupData = await this.getGroupData(groupId);
        if (!groupData) throw new Error("Group not found");
        const currentMembers = groupData.members;

        const processedIds = new Set<string>();

        const desiredMembers = members.map(m => ({
            id: m.email || m.username || "",
            ...m
        })).filter(m => m.id);

        for (const desired of desiredMembers) {
            const existing = currentMembers.find(c =>
                (desired.email && c.email === desired.email) ||
                (desired.username && c.userId === desired.username)
            );

            if (existing) {
                processedIds.add(existing.userId);
            } else {
                let memberName = desired.username || desired.email || "Unknown";
                let memberId = desired.email || desired.username || `user-${self.crypto.randomUUID()}`;

                if (desired.email) {
                    const displayName = await this.shareFile(groupId, desired.email);
                    if (displayName) memberName = displayName;
                    memberId = desired.email;
                }

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

        const membersToDelete = currentMembers
            .filter(m => !processedIds.has(m.userId) && m.role !== 'admin')
            .sort((a, b) => (b._rowIndex || 0) - (a._rowIndex || 0));

        for (const member of membersToDelete) {
            if (member._rowIndex) {
                await this.deleteRow(groupId, "Members", member._rowIndex);
            }
        }
    }

    async deleteGroup(groupId: string): Promise<void> {
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${groupId}`, {
            method: "DELETE"
        });
    }

    async leaveGroup(groupId: string, userId: string): Promise<void> {
        const data = await this.getGroupData(groupId);
        if (!data) throw new Error("Group not found");

        const member = data.members.find(m => m.userId === userId);
        if (!member) throw new Error("Member not found in group");
        
        if (member.role === 'admin') {
             throw new Error("Admins cannot leave group. Transfer ownership or delete group.");
        }

        const hasExpenses = await this.checkMemberHasExpenses(groupId, userId);
        if (hasExpenses) {
            throw new Error("Cannot leave group while involved in expenses. Please settle and remove expenses first.");
        }

        if (member._rowIndex) {
            await this.deleteRow(groupId, "Members", member._rowIndex);
        }
    }

    async checkMemberHasExpenses(groupId: string, userId: string): Promise<boolean> {
        const data = await this.getGroupData(groupId);
        if (!data) return false;

        return data.expenses.some(e => {
            if (e.paidBy === userId) return true;
            if (e.splits && e.splits.some((s: any) => s.userId === userId && s.amount > 0)) return true;
            return false;
        });
    }

    async validateQuozenSpreadsheet(
        spreadsheetId: string,
        userEmail: string
    ): Promise<{ valid: boolean; error?: string; name?: string }> {
        try {
            const metadataRes = await this.fetchWithAuth(
                `${SHEETS_API_URL}/${spreadsheetId}?fields=properties.title,sheets.properties.title`
            );
            const metadata = await metadataRes.json();
            const sheetName = metadata.properties?.title || "";
            const sheetTitles = metadata.sheets?.map((s: any) => s.properties.title) || [];

            if (!sheetName.startsWith(QUOZEN_PREFIX)) {
                return {
                    valid: false,
                    error: `Invalid file: must be a Quozen group (name should start with "${QUOZEN_PREFIX}")`
                };
            }

            const missingSheets = REQUIRED_SHEETS.filter(
                (required) => !sheetTitles.includes(required)
            );
            if (missingSheets.length > 0) {
                return {
                    valid: false,
                    error: `Invalid structure: missing tabs: ${missingSheets.join(", ")}`
                };
            }

            const membersRes = await this.fetchWithAuth(
                `${SHEETS_API_URL}/${spreadsheetId}/values/Members!A2:E`
            );
            const membersData = await membersRes.json();
            const members = membersData.values || [];

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
                return { valid: false, error: "Access denied: you don't have permission to access this file" };
            }
            if (error.message?.includes("404")) {
                return { valid: false, error: "File not found" };
            }
            return { valid: false, error: `Validation failed: ${error.message || "Unknown error"}` };
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
                            try { value = value ? JSON.parse(value) : {}; } catch (e) { value = {}; }
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
            meta: { 
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString()
            }
        };
        return this.addRow(spreadsheetId, "Expenses", newExpense);
    }

    async deleteExpense(spreadsheetId: string, rowIndex: number, expenseId: string): Promise<void> {
        // Story 2.8: Existence Check
        // We fetch the specific row to verify ID before deleting
        const sheetName = "Expenses";
        const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}`;
        
        try {
            const res = await this.fetchWithAuth(url);
            const data = await res.json();
            const rowValues = data.values?.[0];

            if (!rowValues) {
                throw new NotFoundError("Expense not found (row is empty). It may have been deleted.");
            }

            // ID is the first column in SCHEMAS.Expenses
            const currentId = rowValues[0];
            if (currentId !== expenseId) {
                throw new ConflictError("Expense location changed. The sheet was modified by someone else.");
            }

            return this.deleteRow(spreadsheetId, "Expenses", rowIndex);
        } catch (e) {
            throw e;
        }
    }

    async addSettlement(spreadsheetId: string, settlementData: any): Promise<void> {
        const newSettlement = {
            id: self.crypto.randomUUID(),
            ...settlementData,
            date: settlementData.date || new Date().toISOString()
        };
        return this.addRow(spreadsheetId, "Settlements", newSettlement);
    }

    async updateExpense(
        spreadsheetId: string, 
        rowIndex: number, 
        expenseData: Partial<Expense>, 
        expectedLastModified?: string
    ): Promise<void> {
        const sheetName = "Expenses";
        // 1. Fetch current row
        const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}`;
        const res = await this.fetchWithAuth(url);
        const data = await res.json();
        const rowValues = data.values?.[0];

        if (!rowValues) {
            throw new NotFoundError("Expense row not found.");
        }

        // Parse row to check ID and Meta
        // Schema: ["id", "date", "description", "amount", "paidBy", "category", "splits", "meta"]
        // ID is index 0, Meta is index 7
        const currentId = rowValues[0];
        const rawMeta = rowValues[7];
        
        if (currentId !== expenseData.id) {
            throw new ConflictError("Expense ID mismatch. Rows may have shifted.");
        }

        let currentMeta: any = {};
        try {
            currentMeta = rawMeta ? JSON.parse(rawMeta) : {};
        } catch (e) {
            // ignore parse error
        }

        // 2. Conflict Check
        if (expectedLastModified && currentMeta.lastModified) {
            const serverTime = new Date(currentMeta.lastModified).getTime();
            const clientTime = new Date(expectedLastModified).getTime();
            
            // Allow a small epsilon for clock skew if needed, but strict > is safer
            if (serverTime > clientTime) {
                throw new ConflictError("This expense has been modified by someone else.");
            }
        }

        // 3. Prepare Update
        // Merge existing meta with new timestamp
        const newMeta = {
            ...currentMeta,
            lastModified: new Date().toISOString()
        };

        // We need to construct the full row to update using updateRow logic, but we already have the Partial data.
        // We need to merge with existing data to ensure we don't blank out missing fields?
        // Actually `updateRow` expects `data` to map to schema keys.
        // Let's reconstruct the object.
        const updatedObject = {
            ...expenseData,
            splits: expenseData.splits || [], // Ensure splits array
            meta: newMeta
        };

        // Reuse generic updateRow which handles JSON stringification
        return this.updateRow(spreadsheetId, "Expenses", rowIndex, updatedObject);
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
