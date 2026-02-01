import { describe, it, expect, vi } from 'vitest';
import { GoogleDriveProvider } from './google-drive-provider';

// Mock getAuthToken
vi.mock('../tokenStore', () => ({
    getAuthToken: () => "mock-token"
}));

describe('GoogleDriveProvider Integration Logic (Mocked)', () => {
    it('simulates importGroup migration flow', async () => {
        const provider = new GoogleDriveProvider();

        // Mock fetchWithAuth to handle sequence
        const fetchMock = vi.fn();
        (provider as any).fetchWithAuth = fetchMock;

        // Data Snapshots
        const mockSpreadsheetId = "sheet-123";
        const mockUserEmail = "bob@gmail.com";
        const mockGoogleId = "google-uid-bob";
        const mockDisplayName = "Bob Smith";

        // Corrected Schema Order for Expenses: 
        // ["id", "date", "description", "amount", "paidBy", "category", "splits", "meta"]
        const mockExpensesValues = [
            ["e1", "2023-01-01", "Lunch", "10", "u1", "Food", "[]", "{}"]
        ];

        // Corrected Schema Order for Settlements:
        // ["id", "date", "fromUserId", "toUserId", "amount", "method", "notes"]
        const mockSettlementsValues = [
            ["s1", "2023-01-01", "u1", "bob@gmail.com", "10", "cash", ""]
        ];

        // Members (excluding header, assuming A2 query)
        // ["userId", "email", "name", "role", "joinedAt"]
        const mockMembersValues = [
            ["u1", "alice@g", "Alice", "owner", "2023"],
            ["bob@gmail.com", "bob@gmail.com", "Unknown", "member", "2023"]
        ];

        const mockGroupData = {
            valueRanges: [
                { values: mockExpensesValues }, // Expenses
                { values: mockSettlementsValues }, // Settlements
                { values: mockMembersValues } // Members
            ]
        };

        // Responses
        fetchMock.mockImplementation(async (url, options) => {
            if (url.includes("/values:batchGet")) {
                return { ok: true, json: async () => mockGroupData };
            }
            if (url.includes("drive/v3/about")) {
                return { ok: true, json: async () => ({ user: { permissionId: mockGoogleId, displayName: mockDisplayName } }) };
            }
            if (url.includes("/files?q=")) {
                // List settings or groups
                return { ok: true, json: async () => ({ files: [] }) };
            }
            if (url.includes("/files") && options?.method === "POST") {
                // Create settings
                return { ok: true, json: async () => ({ id: "settings-id" }) };
            }
            if (url.includes("spreadsheets") && options?.method === "PUT") {
                // updateRow
                return { ok: true, json: async () => ({}) };
            }
            if (url.includes("spreadsheets")) {
                // validation meta
                return { ok: true, json: async () => ({ properties: { title: "Quozen - Test" }, sheets: [{ properties: { title: "Expenses" } }, { properties: { title: "Settlements" } }, { properties: { title: "Members" } }] }) };
            }

            return { ok: true, json: async () => ({}) };
        });

        // Spy on updateRow to verify calls
        const updateRowSpy = vi.spyOn(provider, 'updateRow');

        await provider.importGroup(mockSpreadsheetId, mockUserEmail);

        // Assertions

        // 1. Member Row Update (Name + ID)
        // Members: Row 1 (Header A1 - not in data). Row 2 (Alice - index 0). Row 3 (Bob - index 1).
        // _rowIndex = i + 2.
        // Bob is at index 1 -> Row 3.
        expect(updateRowSpy).toHaveBeenCalledWith(
            mockSpreadsheetId,
            "Members",
            3,
            expect.objectContaining({
                userId: mockGoogleId, // Should be migrated
                name: mockDisplayName // Should be updated
            })
        );

        // 2. Migration of Expenses/Settlements
        // Settlement s1 (index 0) has "bob@gmail.com".
        // _rowIndex = 0 + 2 = 2.
        expect(updateRowSpy).toHaveBeenCalledWith(
            mockSpreadsheetId,
            "Settlements",
            2,
            expect.objectContaining({
                toUserId: mockGoogleId // Migrated
            })
        );
    });
});
