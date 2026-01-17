
import { IStorageProvider, Group, User, GroupData, SCHEMAS, SchemaType } from "./types";
import { getAuthToken } from "../tokenStore";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";

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

    async listGroups(): Promise<Group[]> {
        const query = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
        const fields = "files(id, name, createdTime)";

        const response = await this.fetchWithAuth(
            `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`
        );

        const data = await response.json();

        return (data.files || []).map((file: any) => ({
            id: file.id,
            name: file.name.replace(/^Quozen - /, ''),
            description: "Google Sheet Group",
            createdBy: "me",
            participants: [],
            createdAt: file.createdTime
        }));
    }

    async createGroupSheet(name: string, user: User): Promise<Group> {
        const title = `Quozen - ${name}`;

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

        const valuesBody = {
            valueInputOption: "USER_ENTERED",
            data: [
                { range: "Expenses!A1", values: [SCHEMAS.Expenses] },
                { range: "Settlements!A1", values: [SCHEMAS.Settlements] },
                { range: "Members!A1", values: [SCHEMAS.Members] },
                { range: "Members!A2", values: [[user.id, user.email, user.name, "admin", new Date().toISOString()]] }
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
            createdBy: "me", // In this flow creator is always "me" effectively
            participants: [user.id],
            createdAt: new Date().toISOString()
        };
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

    private async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
        const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}?fields=sheets.properties`);
        const data = await res.json();
        const sheet = data.sheets.find((s: any) => s.properties.title === sheetName);
        if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
        return sheet.properties.sheetId;
    }
}
