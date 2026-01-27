export const SCHEMAS = {
  Expenses: ["id", "date", "description", "amount", "paidBy", "category", "splits", "meta"],
  Settlements: ["id", "date", "fromUserId", "toUserId", "amount", "method", "notes"],
  Members: ["userId", "email", "name", "role", "joinedAt"]
} as const;

export type SchemaType = keyof typeof SCHEMAS;

export interface Group {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  participants: string[];
  createdAt: string;
  isOwner: boolean; // Added
}

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  picture?: string;
}

export interface MemberInput {
  email?: string;
  username?: string;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  paidBy: string;
  category: string;
  splits: any[];
  meta: any;
  _rowIndex?: number;
}

export interface Settlement {
  id: string;
  date: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  method: string;
  notes?: string;
  _rowIndex?: number;
}

export interface Member {
  userId: string;
  email: string;
  name: string;
  role: string;
  joinedAt: string;
  _rowIndex?: number;
}

export interface GroupData {
  expenses: Expense[];
  settlements: Settlement[];
  members: Member[];
}

export interface IStorageProvider {
  /**
   * List all available groups (spreadsheets)
   */
  listGroups(userEmail?: string): Promise<Group[]>;

  /**
   * Create a new group/spreadsheet with optional initial members
   */
  createGroupSheet(name: string, user: User, members?: MemberInput[]): Promise<Group>;

  /**
   * Update an existing group (rename and/or update members)
   */
  updateGroup(groupId: string, name: string, members: MemberInput[]): Promise<void>;

  /**
   * Permanently delete a group (Owner only)
   */
  deleteGroup(groupId: string): Promise<void>;

  /**
   * Leave a group (Member only)
   */
  leaveGroup(groupId: string, userId: string): Promise<void>;

  /**
   * Check if a member has any associated expenses (paidBy or in splits)
   */
  checkMemberHasExpenses(groupId: string, userId: string): Promise<boolean>;

  /**
   * Validates that a spreadsheet has the correct Quozen structure
   */
  validateQuozenSpreadsheet(
    spreadsheetId: string,
    userEmail: string
  ): Promise<{ valid: boolean; error?: string; name?: string }>;

  /**
   * Get all data for a specific group
   */
  getGroupData(spreadsheetId: string): Promise<GroupData | null>;

  /**
   * Add a new expense
   */
  addExpense(spreadsheetId: string, expenseData: Partial<Expense>): Promise<void>;

  /**
   * Delete an expense by row index
   */
  deleteExpense(spreadsheetId: string, rowIndex: number): Promise<void>;

  /**
   * Add a new settlement
   */
  addSettlement(spreadsheetId: string, settlementData: Partial<Settlement>): Promise<void>;

  /**
   * Update a row in any sheet
   */
  updateRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void>;

  /**
   * Delete a row in any sheet
   */
  deleteRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number): Promise<void>;
}
