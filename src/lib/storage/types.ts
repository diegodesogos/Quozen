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
  isOwner: boolean;
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
  meta: {
    createdAt: string;
    lastModified?: string;
    [key: string]: any;
  };
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

// --- User Settings Types ---

export interface CachedGroup {
  id: string;
  name: string;
  role: "owner" | "member";
  lastAccessed?: string;
}

export interface UserSettings {
  version: number;
  activeGroupId: string | null;
  groupCache: CachedGroup[];
  preferences: {
    defaultCurrency: string;
    theme?: "light" | "dark" | "system";
  };
  lastUpdated: string;
}

export interface IStorageProvider {
  /**
   * Create a new group/spreadsheet with optional initial members.
   * Updates settings file atomically.
   */
  createGroupSheet(name: string, user: User, members?: MemberInput[]): Promise<Group>;

  /**
   * Import an existing spreadsheet into the user's settings.
   * Validates structure and adds to settings file.
   */
  importGroup(spreadsheetId: string, userEmail: string): Promise<Group>;

  /**
   * Update an existing group (rename and/or update members).
   * Updates settings file if name changes.
   */
  updateGroup(groupId: string, name: string, members: MemberInput[], userEmail: string): Promise<void>;

  /**
   * Permanently delete a group (Owner only).
   * Updates settings file.
   */
  deleteGroup(groupId: string, userEmail: string): Promise<void>;

  /**
   * Leave a group (Member only).
   * Updates settings file.
   */
  leaveGroup(groupId: string, userId: string, userEmail: string): Promise<void>;

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
   * Update an existing expense with conflict detection
   */
  updateExpense(
    spreadsheetId: string,
    rowIndex: number,
    expenseData: Partial<Expense>,
    expectedLastModified?: string
  ): Promise<void>;

  /**
   * Delete an expense by row index with existence check
   */
  deleteExpense(spreadsheetId: string, rowIndex: number, expenseId: string): Promise<void>;

  /**
   * Add a new settlement
   */
  addSettlement(spreadsheetId: string, settlementData: Partial<Settlement>): Promise<void>;

  /**
   * Update a row in any sheet (Generic, use updateExpense for conflict checks)
   */
  updateRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void>;

  /**
   * Delete a row in any sheet
   */
  deleteRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number): Promise<void>;

  // --- Settings Management ---

  /**
   * Retrieves the configuration file or initializes it if missing.
   */
  getSettings(userEmail: string): Promise<UserSettings>;

  /**
   * Persists changes to settings.
   */
  saveSettings(settings: UserSettings): Promise<void>;

  /**
   * Atomically updates the activeGroupId in settings.
   */
  updateActiveGroup(userEmail: string, groupId: string): Promise<void>;

  /**
   * Performs a full scan of sources to rebuild the cache and saves it.
   */
  reconcileGroups(userEmail: string): Promise<UserSettings>;
}
