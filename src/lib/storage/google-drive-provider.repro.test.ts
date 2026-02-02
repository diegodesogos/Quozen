import { describe, it, expect, vi } from 'vitest';
import { GoogleDriveProvider } from './google-drive-provider';
import { User } from './types';

// Mock getAuthToken
vi.mock('../tokenStore', () => ({
    getAuthToken: () => "mock-token"
}));

describe('GoogleDriveProvider Integration Logic (Mocked)', () => {
    it('simulates importGroup migration flow', async () => {
        const provider = new GoogleDriveProvider();

        const fetchMock = vi.fn();
        (provider as any).fetchWithAuth = fetchMock;

        const mockSpreadsheetId = "sheet-123";
        // User object representing the current session
        const mockUser: User = {
            id: "google-uid-bob",
            email: "bob@gmail.com",
            name: "Bob Smith",
            username: "bob"
        };

        const mockExpensesValues = [
            ["e1", "2023-01-01", "Lunch", "10", "u1", "Food", "[]", "{}"]
        ];

        const mockSettlementsValues = [
            ["s1", "2023-01-01", "u1", "bob@gmail.com", "10", "cash", ""]
        ];

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

        fetchMock.mockImplementation(async (url, options) => {
            if (url.includes("/values:batchGet")) {
                return { ok: true, json: async () => mockGroupData };
            }
            if (url.includes("drive/v3/about")) {
                // Should not be called anymore if using passed user object!
                // But if logic changed to use passed user, this mock return shouldn't matter for ID logic.
                return { ok: true, json: async () => ({ user: { permissionId: "some-other-id", displayName: "Wrong Name" } }) };
            }
            if (url.includes("/files?q=")) {
                return { ok: true, json: async () => ({ files: [] }) };
            }
            if (url.includes("/files") && options?.method === "POST") {
                return { ok: true, json: async () => ({ id: "settings-id" }) };
            }
            if (url.includes("spreadsheets") && options?.method === "PUT") {
                return { ok: true, json: async () => ({}) };
            }
            if (url.includes("spreadsheets")) {
                return { ok: true, json: async () => ({ properties: { title: "Quozen - Test" }, sheets: [{ properties: { title: "Expenses" } }, { properties: { title: "Settlements" } }, { properties: { title: "Members" } }] }) };
            }

            return { ok: true, json: async () => ({}) };
        });

        const updateRowSpy = vi.spyOn(provider, 'updateRow');

        // Pass the full user object
        await provider.importGroup(mockSpreadsheetId, mockUser);

        // 1. Member Row Update (Name + ID)
        // Ensure it uses the ID from the User object ("google-uid-bob"), NOT the one from Drive/About
        expect(updateRowSpy).toHaveBeenCalledWith(
            mockSpreadsheetId,
            "Members",
            3,
            expect.objectContaining({
                userId: mockUser.id,
                name: mockUser.name
            })
        );

        // 2. Migration of Expenses/Settlements
        expect(updateRowSpy).toHaveBeenCalledWith(
            mockSpreadsheetId,
            "Settlements",
            2,
            expect.objectContaining({
                toUserId: mockUser.id
            })
        );
    });
});
