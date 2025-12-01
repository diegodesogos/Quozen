import { type User, type InsertUser, type Group, type InsertGroup, type Expense, type InsertExpense, type Settlement, type InsertSettlement } from "@shared/schema";
import { IStorage } from '../storage';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';

interface GoogleSheetsConfig {
  rootSheetsId: string;
  credentials: string;
  serviceAccountEmail?: string;
  privateKey?: string;
}

export class GoogleSheetsStorage implements IStorage {
  private rootSheetsId: string;
  private credentials: string;
  private serviceAccountEmail?: string;
  private privateKey?: string;
  private sheets: any;
  private drive: any;

  constructor(config: GoogleSheetsConfig) {
    this.rootSheetsId = config.rootSheetsId;
    this.credentials = config.credentials;
    this.serviceAccountEmail = config.serviceAccountEmail;
    this.privateKey = config.privateKey;
    this.initializeGoogleAPIs();
  }

  private async initializeGoogleAPIs() {
    try {
      let auth;
      
      if (this.serviceAccountEmail && this.privateKey) {
        // Service account authentication
        auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: this.serviceAccountEmail,
            private_key: this.privateKey.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
        });
      } else {
        // JSON credentials authentication
        const credentials = JSON.parse(this.credentials);
        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
        });
      }

      this.sheets = google.sheets({ version: 'v4', auth });
      this.drive = google.drive({ version: 'v3', auth });
      
      // Initialize root spreadsheet if it doesn't exist
      await this.initializeRootSpreadsheet();
    } catch (error) {
      console.error('Failed to initialize Google APIs:', error);
      throw new Error('Google Sheets authentication failed');
    }
  }

  private async initializeRootSpreadsheet() {
    try {
      // Check if root spreadsheet exists and has the required sheets
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.rootSheetsId,
      });

      const existingSheets = spreadsheet.data.sheets?.map((sheet: any) => sheet.properties?.title) || [];
      
      // Create required sheets if they don't exist
      const requiredSheets = ['users', 'groups', 'config'];
      const sheetsToCreate = requiredSheets.filter(sheetName => !existingSheets.includes(sheetName));

      if (sheetsToCreate.length > 0) {
        const requests = sheetsToCreate.map(sheetName => ({
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        }));

        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.rootSheetsId,
          requestBody: {
            requests,
          },
        });

        // Add headers to each sheet
        for (const sheetName of sheetsToCreate) {
          await this.addHeadersToSheet(this.rootSheetsId, sheetName);
        }
      }
    } catch (error) {
      console.error('Failed to initialize root spreadsheet:', error);
      throw new Error('Root spreadsheet initialization failed');
    }
  }

  private async addHeadersToSheet(spreadsheetId: string, sheetName: string) {
    const headers = this.getHeadersForSheet(sheetName);
    if (headers.length === 0) return;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
  }

  private getHeadersForSheet(sheetName: string): string[] {
    switch (sheetName) {
      case 'users':
        return ['id', 'username', 'email', 'name'];
      case 'groups':
        return ['id', 'name', 'description', 'createdBy', 'participants', 'createdAt', 'spreadsheetId'];
      case 'config':
        return ['key', 'value'];
      case 'expenses':
        return ['id', 'groupId', 'description', 'amount', 'paidBy', 'category', 'date', 'splits'];
      case 'settlements':
        return ['id', 'groupId', 'fromUserId', 'toUserId', 'amount', 'method', 'notes', 'date'];
      default:
        return [];
    }
  }

  private async createGroupSpreadsheet(groupId: string, groupName: string): Promise<string> {
    try {
      const spreadsheet = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `Quozen - ${groupName}`,
          },
          sheets: [
            {
              properties: {
                title: 'expenses',
              },
            },
            {
              properties: {
                title: 'settlements',
              },
            },
          ],
        },
      });

      const spreadsheetId = spreadsheet.data.spreadsheetId!;
      
      // Add headers to the sheets
      await this.addHeadersToSheet(spreadsheetId, 'expenses');
      await this.addHeadersToSheet(spreadsheetId, 'settlements');

      return spreadsheetId;
    } catch (error) {
      console.error('Failed to create group spreadsheet:', error);
      throw new Error('Failed to create group spreadsheet');
    }
  }

  private async getSheetData(spreadsheetId: string, sheetName: string, startRow = 2): Promise<any[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A${startRow}:Z`,
      });
      return response.data.values || [];
    } catch (error) {
      console.error(`Failed to get data from ${sheetName}:`, error);
      return [];
    }
  }

  private async appendToSheet(spreadsheetId: string, sheetName: string, values: any[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });
    } catch (error) {
      console.error(`Failed to append to ${sheetName}:`, error);
      throw new Error(`Failed to append to ${sheetName}`);
    }
  }

  private async updateSheetRow(spreadsheetId: string, sheetName: string, rowIndex: number, values: any[]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:Z${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [values],
        },
      });
    } catch (error) {
      console.error(`Failed to update row in ${sheetName}:`, error);
      throw new Error(`Failed to update row in ${sheetName}`);
    }
  }

  private async findRowIndex(spreadsheetId: string, sheetName: string, id: string, idColumn = 0): Promise<number> {
    const data = await this.getSheetData(spreadsheetId, sheetName);
    for (let i = 0; i < data.length; i++) {
      if (data[i][idColumn] === id) {
        return i + 2; // +2 because data starts from row 2 (1-indexed)
      }
    }
    return -1;
  }

  private async deleteSheetRow(spreadsheetId: string, sheetName: string, rowIndex: number): Promise<void> {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: await this.getSheetId(spreadsheetId, sheetName),
                  dimension: 'ROWS',
                  startIndex: rowIndex - 1,
                  endIndex: rowIndex,
                },
              },
            },
          ],
        },
      });
    } catch (error) {
      console.error(`Failed to delete row in ${sheetName}:`, error);
      throw new Error(`Failed to delete row in ${sheetName}`);
    }
  }

  private async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId,
    });
    const sheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title === sheetName);
    return sheet?.properties?.sheetId || 0;
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const data = await this.getSheetData(this.rootSheetsId, 'users');
    const userRow = data.find(row => row[0] === id);
    if (!userRow) return undefined;

    return {
      id: userRow[0],
      username: userRow[1],
      email: userRow[2],
      name: userRow[3],
      role: userRow[4] as User['role'] || 'member',
      hashedPassword: userRow[5] || null,
      provider: userRow[6] || null,
      providerId: userRow[7] || null,
      lastLoginAt: userRow[8] ? new Date(userRow[8]) : null
    };
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const data = await this.getSheetData(this.rootSheetsId, 'users');
    const userRow = data.find(row => row[1] === username);
    if (!userRow) return undefined;

    return {
      id: userRow[0],
      username: userRow[1],
      email: userRow[2],
      name: userRow[3],
      role: userRow[4] as User['role'] || 'member',
      hashedPassword: userRow[5] || null,
      provider: userRow[6] || null,
      providerId: userRow[7] || null,
      lastLoginAt: userRow[8] ? new Date(userRow[8]) : null
    };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const data = await this.getSheetData(this.rootSheetsId, 'users');
    const userRow = data.find(row => row[2] === email);
    if (!userRow) return undefined;

    return {
      id: userRow[0],
      username: userRow[1],
      email: userRow[2],
      name: userRow[3],
      role: userRow[4] as User['role'] || 'member',
      hashedPassword: userRow[5] || null,
      provider: userRow[6] || null,
      providerId: userRow[7] || null,
      lastLoginAt: userRow[8] ? new Date(userRow[8]) : null
    };
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = uuidv4();
    const user: User = {
      id,
      ...insertUser,
      lastLoginAt: new Date(),
      hashedPassword: insertUser.hashedPassword || null,
      provider: insertUser.provider || null,
      providerId: insertUser.providerId || null
    };

    await this.appendToSheet(this.rootSheetsId, 'users', [[
      user.id,
      user.username,
      user.email,
      user.name,
      user.role,
      user.hashedPassword,
      user.provider,
      user.providerId,
      user.lastLoginAt ? user.lastLoginAt.toISOString() : null
    ]]);

    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const rowIndex = await this.findRowIndex(this.rootSheetsId, 'users', id);
    if (rowIndex === -1) return undefined;

    const existingUser = await this.getUser(id);
    if (!existingUser) return undefined;

    const updatedUser = { ...existingUser, ...updates };
    await this.updateSheetRow(this.rootSheetsId, 'users', rowIndex, [
      updatedUser.id,
      updatedUser.username,
      updatedUser.email,
      updatedUser.name,
      updatedUser.role,
      updatedUser.hashedPassword,
      updatedUser.provider,
      updatedUser.providerId,
      updatedUser.lastLoginAt ? updatedUser.lastLoginAt.toISOString() : null
    ]);

    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    const data = await this.getSheetData(this.rootSheetsId, 'users');
    return data.map(row => ({
      id: row[0],
      username: row[1],
      email: row[2],
      name: row[3],
      role: row[4] as User['role'],
      hashedPassword: row[5],
      provider: row[6],
      providerId: row[7],
      lastLoginAt: row[8] ? new Date(row[8]) : null
    }));
  }

  // Group operations
  async getGroup(id: string): Promise<Group | undefined> {
    const data = await this.getSheetData(this.rootSheetsId, 'groups');
    const groupRow = data.find(row => row[0] === id);
    if (!groupRow) return undefined;

    return {
      id: groupRow[0],
      name: groupRow[1],
      description: groupRow[2] || null,
      createdBy: groupRow[3],
      participants: JSON.parse(groupRow[4] || '[]'),
      createdAt: groupRow[5] ? new Date(groupRow[5]) : new Date(),
    };
  }

  async createGroup(insertGroup: InsertGroup): Promise<Group> {
    const id = uuidv4();
    const spreadsheetId = await this.createGroupSpreadsheet(id, insertGroup.name);
    const group: Group = {
      id,
      name: insertGroup.name,
      description: insertGroup.description || null,
      createdBy: insertGroup.createdBy,
      participants: Array.isArray(insertGroup.participants) ? insertGroup.participants as string[] : [],
      createdAt: new Date(),
    };

    await this.appendToSheet(this.rootSheetsId, 'groups', [[
      group.id,
      group.name,
      group.description || '',
      group.createdBy,
      JSON.stringify(group.participants),
      group.createdAt?.toISOString() || new Date().toISOString(),
      spreadsheetId,
    ]]);

    return group;
  }

  async updateGroup(id: string, updates: Partial<Group>): Promise<Group | undefined> {
    const existingGroup = await this.getGroup(id);
    if (!existingGroup) return undefined;

    const updatedGroup = { ...existingGroup, ...updates };
    const rowIndex = await this.findRowIndex(this.rootSheetsId, 'groups', id);
    if (rowIndex === -1) return undefined;

    await this.updateSheetRow(this.rootSheetsId, 'groups', rowIndex, [
      updatedGroup.id,
      updatedGroup.name,
      updatedGroup.description || '',
      updatedGroup.createdBy,
      JSON.stringify(updatedGroup.participants),
      updatedGroup.createdAt?.toISOString() || new Date().toISOString(),
      (existingGroup as any).spreadsheetId || '',
    ]);

    return updatedGroup;
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    const data = await this.getSheetData(this.rootSheetsId, 'groups');
    return data
      .filter(row => {
        const participants = JSON.parse(row[4] || '[]');
        return row[3] === userId || participants.includes(userId);
      })
      .map(row => ({
        id: row[0],
        name: row[1],
        description: row[2] || null,
        createdBy: row[3],
        participants: JSON.parse(row[4] || '[]'),
        createdAt: row[5] ? new Date(row[5]) : new Date(),
      }));
  }

  async getAllGroups(): Promise<Group[]> {
    const data = await this.getSheetData(this.rootSheetsId, 'groups');
    return data.map(row => ({
      id: row[0],
      name: row[1],
      description: row[2] || null,
      createdBy: row[3],
      participants: JSON.parse(row[4] || '[]'),
      createdAt: row[5] ? new Date(row[5]) : new Date(),
    }));
  }

  // Expense operations
  async getExpense(id: string): Promise<Expense | undefined> {
    // First find which group this expense belongs to
    const groups = await this.getAllGroups();
    for (const group of groups) {
      const spreadsheetId = (group as any).spreadsheetId;
      if (!spreadsheetId) continue;

      const data = await this.getSheetData(spreadsheetId, 'expenses');
      const expenseRow = data.find(row => row[0] === id);
      if (expenseRow) {
        return {
          id: expenseRow[0],
          groupId: expenseRow[1],
          description: expenseRow[2],
          amount: expenseRow[3],
          paidBy: expenseRow[4],
          category: expenseRow[5],
          date: new Date(expenseRow[6]),
          splits: JSON.parse(expenseRow[7] || '[]'),
        };
      }
    }
    return undefined;
  }

  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    const id = uuidv4();
    const expense: Expense = {
      id,
      groupId: insertExpense.groupId,
      description: insertExpense.description,
      amount: insertExpense.amount,
      paidBy: insertExpense.paidBy,
      category: insertExpense.category,
      date: insertExpense.date,
      splits: Array.isArray(insertExpense.splits) ? insertExpense.splits as { userId: string; amount: number }[] : [],
    };

    // Find the group's spreadsheet
    const group = await this.getGroup(insertExpense.groupId);
    if (!group) throw new Error('Group not found');

    const spreadsheetId = (group as any).spreadsheetId;
    if (!spreadsheetId) throw new Error('Group spreadsheet not found');

    await this.appendToSheet(spreadsheetId, 'expenses', [[
      expense.id,
      expense.groupId,
      expense.description,
      expense.amount,
      expense.paidBy,
      expense.category,
      expense.date.toISOString(),
      JSON.stringify(expense.splits),
    ]]);

    return expense;
  }

  async updateExpense(id: string, updates: Partial<Expense>): Promise<Expense | undefined> {
    const existingExpense = await this.getExpense(id);
    if (!existingExpense) return undefined;

    const updatedExpense = { ...existingExpense, ...updates };
    
    // Find the group's spreadsheet
    const group = await this.getGroup(existingExpense.groupId);
    if (!group) return undefined;

    const spreadsheetId = (group as any).spreadsheetId;
    if (!spreadsheetId) return undefined;

    const rowIndex = await this.findRowIndex(spreadsheetId, 'expenses', id);
    if (rowIndex === -1) return undefined;

    await this.updateSheetRow(spreadsheetId, 'expenses', rowIndex, [
      updatedExpense.id,
      updatedExpense.groupId,
      updatedExpense.description,
      updatedExpense.amount,
      updatedExpense.paidBy,
      updatedExpense.category,
      updatedExpense.date.toISOString(),
      JSON.stringify(updatedExpense.splits),
    ]);

    return updatedExpense;
  }

  async deleteExpense(id: string): Promise<boolean> {
    // First find which group this expense belongs to
    const groups = await this.getAllGroups();
    for (const group of groups) {
      const spreadsheetId = (group as any).spreadsheetId;
      if (!spreadsheetId) continue;

      const rowIndex = await this.findRowIndex(spreadsheetId, 'expenses', id);
      if (rowIndex !== -1) {
        await this.deleteSheetRow(spreadsheetId, 'expenses', rowIndex);
        return true;
      }
    }
    return false;
  }

  async getGroupExpenses(groupId: string): Promise<Expense[]> {
    const group = await this.getGroup(groupId);
    if (!group) return [];

    const spreadsheetId = (group as any).spreadsheetId;
    if (!spreadsheetId) return [];

    const data = await this.getSheetData(spreadsheetId, 'expenses');
    return data.map(row => ({
      id: row[0],
      groupId: row[1],
      description: row[2],
      amount: row[3],
      paidBy: row[4],
      category: row[5],
      date: new Date(row[6]),
      splits: JSON.parse(row[7] || '[]'),
    }));
  }

  // Settlement operations
  async getSettlement(id: string): Promise<Settlement | undefined> {
    // First find which group this settlement belongs to
    const groups = await this.getAllGroups();
    for (const group of groups) {
      const spreadsheetId = (group as any).spreadsheetId;
      if (!spreadsheetId) continue;

      const data = await this.getSheetData(spreadsheetId, 'settlements');
      const settlementRow = data.find(row => row[0] === id);
      if (settlementRow) {
        return {
          id: settlementRow[0],
          groupId: settlementRow[1],
          fromUserId: settlementRow[2],
          toUserId: settlementRow[3],
          amount: settlementRow[4],
          method: settlementRow[5],
          notes: settlementRow[6] || null,
          date: settlementRow[7] ? new Date(settlementRow[7]) : new Date(),
        };
      }
    }
    return undefined;
  }

  async createSettlement(insertSettlement: InsertSettlement): Promise<Settlement> {
    const id = uuidv4();
    const settlement: Settlement = {
      id,
      groupId: insertSettlement.groupId,
      fromUserId: insertSettlement.fromUserId,
      toUserId: insertSettlement.toUserId,
      amount: insertSettlement.amount,
      method: insertSettlement.method,
      notes: insertSettlement.notes || null,
      date: new Date(),
    };

    // Find the group's spreadsheet
    const group = await this.getGroup(insertSettlement.groupId);
    if (!group) throw new Error('Group not found');

    const spreadsheetId = (group as any).spreadsheetId;
    if (!spreadsheetId) throw new Error('Group spreadsheet not found');

    await this.appendToSheet(spreadsheetId, 'settlements', [[
      settlement.id,
      settlement.groupId,
      settlement.fromUserId,
      settlement.toUserId,
      settlement.amount,
      settlement.method,
      settlement.notes || '',
      settlement.date?.toISOString() || new Date().toISOString(),
    ]]);

    return settlement;
  }

  async getGroupSettlements(groupId: string): Promise<Settlement[]> {
    const group = await this.getGroup(groupId);
    if (!group) return [];

    const spreadsheetId = (group as any).spreadsheetId;
    if (!spreadsheetId) return [];

    const data = await this.getSheetData(spreadsheetId, 'settlements');
    return data.map(row => ({
      id: row[0],
      groupId: row[1],
      fromUserId: row[2],
      toUserId: row[3],
      amount: row[4],
      method: row[5],
      notes: row[6] || null,
      date: row[7] ? new Date(row[7]) : new Date(),
    }));
  }
}
