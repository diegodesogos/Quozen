import { getAuthToken } from "./tokenStore";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";

// Schema Definitions.
// NOTE: 'splits' in Expenses is a column that will contain a JSON string.
const SCHEMAS = {
  Expenses: ["id", "date", "description", "amount", "paidBy", "category", "splits", "meta"],
  Settlements: ["id", "date", "fromUserId", "toUserId", "amount", "method", "notes"],
  Members: ["userId", "email", "name", "role", "joinedAt"]
};

// Helper to get authorization headers
const getHeaders = () => {
  const token = getAuthToken();
  if (!token) throw new Error("No access token found");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

export const googleApi = {
  // --- DRIVE API (File Management) ---

  /**
   * List Spreadsheets created by the app (or opened by it)
   */
  async listGroups() {
    const query = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
    const fields = "files(id, name, createdTime)";
    
    const response = await fetch(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error("Error listing groups");
    return (await response.json()).files || [];
  },

  /**
   * Create a new Group Spreadsheet and configure initial sheets and headers
   */
  async createGroupSheet(title: string, user: { id: string, email: string, name: string }) {
    // 1. Create the Spreadsheet with the required sheets
    const createRes = await fetch(SHEETS_API_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: "Expenses" } },
          { properties: { title: "Settlements" } },
          { properties: { title: "Members" } }
        ]
      })
    });
    
    if (!createRes.ok) throw new Error("Failed to create spreadsheet");
    const sheetFile = await createRes.json();
    const spreadsheetId = sheetFile.spreadsheetId;

    // 2. Write headers and the initial member (creator)
    const valuesBody = {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "Expenses!A1", values: [SCHEMAS.Expenses] },
        { range: "Settlements!A1", values: [SCHEMAS.Settlements] },
        { range: "Members!A1", values: [SCHEMAS.Members] },
        // Add creator as admin
        { range: "Members!A2", values: [[user.id, user.email, user.name, "admin", new Date().toISOString()]] }
      ]
    };

    await fetch(`${SHEETS_API_URL}/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(valuesBody)
    });

    return sheetFile;
  },

  // --- SHEETS API (Data Operations) ---

  /**
   * Fetch all group data and parse it into objects
   */
  async getGroupData(spreadsheetId: string) {
    // Request data ranges (assuming < 10k rows for now)
    const ranges = ["Expenses!A2:Z", "Settlements!A2:Z", "Members!A2:Z"];
    const url = `${SHEETS_API_URL}/${spreadsheetId}/values:batchGet?majorDimension=ROWS&${ranges.map(r => `ranges=${r}`).join('&')}`;
    
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error("Error fetching group data");
    
    const data = await res.json();
    const valueRanges = data.valueRanges; // Array of results in requested order

    // Helper to convert array of arrays to array of objects
    const mapRows = (rows: any[][], schema: string[]) => {
      if (!rows) return [];
      return rows.map(row => {
        const obj: any = {};
        schema.forEach((key, index) => {
          let value = row[index];
          // Automatically detect and parse JSON for fields like 'splits' or 'meta'
          if (key === 'splits' || key === 'meta') {
            try {
              value = value ? JSON.parse(value) : []; // Default to empty array/obj if empty
            } catch (e) {
              console.warn(`Failed to parse JSON for field ${key}`, value);
              value = null;
            }
          }
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

  /**
   * Append a row. Handles serialization of Objects/Arrays to JSON Strings.
   */
  async addRow(spreadsheetId: string, sheetName: keyof typeof SCHEMAS, data: any) {
    const schema = SCHEMAS[sheetName];
    
    // Sort data according to schema and serialize objects
    const rowValues = schema.map(key => {
      const val = data[key];
      // Serialize objects/arrays to string to save them in a single cell
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val);
      }
      return val === undefined || val === null ? "" : val;
    });

    const url = `${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`;
    
    const res = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        values: [rowValues]
      })
    });

    if (!res.ok) throw new Error(`Error adding row to ${sheetName}`);
    return res.json();
  }
};
