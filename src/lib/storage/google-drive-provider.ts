import { IStorageProvider, Group, User, GroupData, SCHEMAS, SchemaType, MemberInput, Member, Expense, UserSettings, CachedGroup } from "./types";
import { getAuthToken } from "../tokenStore";
import { ConflictError, NotFoundError } from "../errors";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";

/** Naming convention for Quozen spreadsheets */
export const QUOZEN_PREFIX = "Quozen - ";
export const SETTINGS_FILE_NAME = "quozen-settings.json";

/** Required sheet tabs for a valid Quozen spreadsheet */
export const REQUIRED_SHEETS = ["Expenses", "Settlements", "Members"] as const;

export class GoogleDriveProvider implements IStorageProvider {
    private settingsFileIdCache: string | null = null;

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

    // --- Settings Management Implementation ---

    async getSettings(userEmail: string): Promise<UserSettings> {
        try {
            // 1. Try to find the settings file
            const query = `name = '${SETTINGS_FILE_NAME}' and trashed = false`;
            const fields = "files(id, name, createdTime)";
            const listUrl = `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;
            
            const listRes = await this.fetchWithAuth(listUrl);
            const listData = await listRes.json();

            if (listData.files && listData.files.length > 0) {
                const file = listData.files[0];
                this.settingsFileIdCache = file.id;

                // 2. Download content
                const downloadUrl = `${DRIVE_API_URL}/files/${file.id}?alt=media`;
                const contentRes = await this.fetchWithAuth(downloadUrl);
                const settings = await contentRes.json();

                // Basic validation/migration could go here
                if (!settings.version) {
                    return this.reconcileGroups(userEmail); 
                }
                
                return settings as UserSettings;
            } else {
                // 3. Not found -> Reconcile (First Run)
                return this.reconcileGroups(userEmail);
            }
        } catch (e) {
            console.error("Error fetching settings, falling back to reconcile", e);
            return this.reconcileGroups(userEmail);
        }
    }

    async saveSettings(settings: UserSettings): Promise<void> {
        settings.lastUpdated = new Date().toISOString();
        const content = JSON.stringify(settings, null, 2);

        try {
            let fileId = this.settingsFileIdCache;

            // If we don't have a cached ID, try to find it first (safety check)
            if (!fileId) {
                const query = `name = '${SETTINGS_FILE_NAME}' and trashed = false`;
                const listRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}`);
                const listData = await listRes.json();
                if (listData.files && listData.files.length > 0) {
                    fileId = listData.files[0].id;
                    this.settingsFileIdCache = fileId;
                }
            }

            if (fileId) {
                // Update existing file
                await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}?uploadType=media`, {
                    method: "PATCH",
                    body: content
                });
            } else {
                // Create new file
                const createRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files`, {
                    method: "POST",
                    body: JSON.stringify({
                        name: SETTINGS_FILE_NAME,
                        mimeType: "application/json"
                    })
                });
                const fileData = await createRes.json();
                this.settingsFileIdCache = fileData.id;

                // Upload content to the new file
                await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileData.id}?uploadType=media`, {
                    method: "PATCH",
                    body: content
                });
            }
        } catch (e) {
            console.error("Failed to save settings", e);
            throw e;
        }
    }

    async reconcileGroups(userEmail: string): Promise<UserSettings> {
        // 1. Scan for all spreadsheets
        const query = `mimeType = 'application/vnd.google-apps.spreadsheet' and name contains '${QUOZEN_PREFIX}' and trashed = false`;
        const fields = "files(id, name, createdTime, owners, capabilities)";
        const response = await this.fetchWithAuth(
            `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`
        );
        const data = await response.json();
        const candidateFiles = (data.files || []).filter((file: any) =>
            file.name.startsWith(QUOZEN_PREFIX)
        );

        const visibleGroups: CachedGroup[] = [];

        for (const file of candidateFiles) {
            const isOwner = file.owners?.some((owner: any) => owner.emailAddress === userEmail) || file.capabilities?.canDelete;
            
            visibleGroups.push({
                id: file.id,
                name: file.name.slice(QUOZEN_PREFIX.length),
                role: isOwner ? "owner" : "member",
                lastAccessed: file.createdTime 
            });
        }

        // Sort by most recent
        visibleGroups.sort((a, b) => new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime());

        // 3. Create Settings Object
        const settings: UserSettings = {
            version: 1,
            activeGroupId: visibleGroups.length > 0 ? visibleGroups[0].id : null,
            groupCache: visibleGroups,
            preferences: {
                defaultCurrency: "USD",
                theme: "system"
            },
            lastUpdated: new Date().toISOString()
        };

        // 4. Save to Drive
        await this.saveSettings(settings);
        
        return settings;
    }

    // --- Modified IStorageProvider Implementation ---

    async listGroups(userEmail?: string): Promise<Group[]> {
        if (!userEmail) return [];

        const settings = await this.getSettings(userEmail);
        
        return settings.groupCache.map(cg => ({
            id: cg.id,
            name: cg.name,
            description: "Google Sheet Group",
            createdBy: "Unknown", 
            participants: [], 
            createdAt: cg.lastAccessed || new Date().toISOString(),
            isOwner: cg.role === 'owner'
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

        // 4. Update Settings Cache
        try {
            if (user.email) {
                const settings = await this.getSettings(user.email);
                
                // Add to cache if not exists
                if (!settings.groupCache.some(g => g.id === spreadsheetId)) {
                    settings.groupCache.unshift({
                        id: spreadsheetId,
                        name: name,
                        role: "owner",
                        lastAccessed: new Date().toISOString()
                    });
                }
                settings.activeGroupId = spreadsheetId;
                await this.saveSettings(settings);
            }
        } catch (e) {
            console.error("Failed to update settings cache after creation", e);
        }

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
        const sheetName = "Expenses";
        const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}`;
        
        try {
            const res = await this.fetchWithAuth(url);
            const data = await res.json();
            const rowValues = data.values?.[0];

            if (!rowValues) {
                throw new NotFoundError("Expense not found (row is empty).It may have been deleted.");
            }

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
        const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}`;
        const res = await this.fetchWithAuth(url);
        const data = await res.json();
        const rowValues = data.values?.[0];

        if (!rowValues) {
            throw new NotFoundError("Expense row not found.");
        }

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

        if (expectedLastModified && currentMeta.lastModified) {
            const serverTime = new Date(currentMeta.lastModified).getTime();
            const clientTime = new Date(expectedLastModified).getTime();
            
            if (serverTime > clientTime) {
                throw new ConflictError("This expense has been modified by someone else.");
            }
        }

        const newMeta = {
            ...currentMeta,
            lastModified: new Date().toISOString()
        };

        const updatedObject = {
            ...expenseData,
            splits: expenseData.splits || [], 
            meta: newMeta
        };

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
