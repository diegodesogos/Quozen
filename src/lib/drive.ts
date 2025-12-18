import { getAuthToken } from "./tokenStore";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";

// Schema Definitions
export const SCHEMAS = {
  Expenses: ["id", "date", "description", "amount", "paidBy", "category", "splits", "meta"],
  Settlements: ["id", "date", "fromUserId", "toUserId", "amount", "method", "notes"],
  Members: ["userId", "email", "name", "role", "joinedAt"]
};

const getHeaders = () => {
  const token = getAuthToken();
  if (!token) throw new Error("No access token found");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

export const googleApi = {
  // --- DRIVE API ---

  async listGroups() {
    const query = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
    const fields = "files(id, name, createdTime)";
    
    const response = await fetch(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`,
      { headers: getHeaders() }
    );
    
    if (!response.ok) throw new Error("Error listing groups");
    const data = await response.json();
    
    return (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name.replace(/^Quozen - /, ''),
      description: "Google Sheet Group",
      createdBy: "me",
      participants: [], 
      createdAt: file.createdTime
    }));
  },

  async createGroupSheet(name: string, user: { id: string, email: string, name: string }) {
    const title = `Quozen - ${name}`;
    
    const createRes = await fetch(SHEETS_API_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: "Expenses", gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: "Settlements", gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: "Members", gridProperties: { frozenRowCount: 1 } } }
        ]
      })
    });
    
    if (!createRes.ok) throw new Error("Failed to create spreadsheet");
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

    await fetch(`${SHEETS_API_URL}/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(valuesBody)
    });

    return {
      id: spreadsheetId,
      name: name,
      participants: [user.id],
      createdAt: new Date().toISOString()
    };
  },

  // --- SHEETS API ---

  async getGroupData(spreadsheetId: string) {
    if (!spreadsheetId) return null;
    
    const ranges = ["Expenses!A2:Z", "Settlements!A2:Z", "Members!A2:Z"];
    const url = `${SHEETS_API_URL}/${spreadsheetId}/values:batchGet?majorDimension=ROWS&${ranges.map(r => `ranges=${r}`).join('&')}`;
    
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error("Error fetching group data");
    
    const data = await res.json();
    const valueRanges = data.valueRanges; 

    const mapRows = (rows: any[][], schema: string[]) => {
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
      expenses: mapRows(valueRanges[0].values, SCHEMAS.Expenses),
      settlements: mapRows(valueRanges[1].values, SCHEMAS.Settlements),
      members: mapRows(valueRanges[2].values, SCHEMAS.Members),
    };
  },

  async addRow(spreadsheetId: string, sheetName: keyof typeof SCHEMAS, data: any) {
    const schema = SCHEMAS[sheetName];
    const rowValues = schema.map(key => {
      const val = data[key];
      return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : (val ?? "");
    });

    const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ values: [rowValues] })
    });
  },

  // NEW: Helper to find the numeric Sheet ID (GID)
  async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
    const res = await fetch(`${SHEETS_API_URL}/${spreadsheetId}?fields=sheets.properties`, { headers: getHeaders() });
    const data = await res.json();
    const sheet = data.sheets.find((s: any) => s.properties.title === sheetName);
    if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
    return sheet.properties.sheetId;
  },

  // NEW: Update an existing row
  async updateRow(spreadsheetId: string, sheetName: keyof typeof SCHEMAS, rowIndex: number, data: any) {
    const schema = SCHEMAS[sheetName];
    const rowValues = schema.map(key => {
      const val = data[key];
      return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : (val ?? "");
    });

    const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ values: [rowValues] })
    });
  },

  // NEW: Delete a specific row
  async deleteRow(spreadsheetId: string, sheetName: keyof typeof SCHEMAS, rowIndex: number) {
    const sheetId = await this.getSheetId(spreadsheetId, sheetName);
    const body = {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: "ROWS",
            startIndex: rowIndex - 1, // 0-indexed, inclusive
            endIndex: rowIndex        // 0-indexed, exclusive
          }
        }
      }]
    };

    await fetch(`${SHEETS_API_URL}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body)
    });
  },

  // --- Domain Helper Methods ---

  async addExpense(spreadsheetId: string, expenseData: any) {
    const newExpense = {
      id: self.crypto.randomUUID(),
      ...expenseData,
      splits: expenseData.splits || [],
      meta: { createdAt: new Date().toISOString() }
    };
    return this.addRow(spreadsheetId, "Expenses", newExpense);
  },

  async deleteExpense(spreadsheetId: string, rowIndex: number) {
    return this.deleteRow(spreadsheetId, "Expenses", rowIndex);
  },

  async addSettlement(spreadsheetId: string, settlementData: any) {
    const newSettlement = {
      id: self.crypto.randomUUID(),
      ...settlementData,
      date: settlementData.date || new Date().toISOString()
    };
    return this.addRow(spreadsheetId, "Settlements", newSettlement);
  }
};
