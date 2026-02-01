import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Dashboard from "../dashboard";
import { useAppContext } from "@/context/app-context";
import { useQuery } from "@tanstack/react-query";

// Mock SettlementModal to inspect props
const mockSettlementModal = vi.fn();
vi.mock("@/components/settlement-modal", () => ({
    default: (props: any) => {
        mockSettlementModal(props);
        return props.isOpen ? <div data-testid="mock-settlement-modal">Modal Open</div> : null;
    },
}));

// Mock hooks
vi.mock("@/context/app-context", () => ({
    useAppContext: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@tanstack/react-query")>();
    return {
        ...actual,
        useQuery: vi.fn(),
        useMutation: vi.fn(() => ({ mutate: vi.fn() })),
        useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
    };
});

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/lib/drive", () => ({
    googleApi: { getGroupData: vi.fn() },
}));

describe("Dashboard Bug Reproduction", () => {
    const mockMembers = [
        { userId: "u1", name: "Alice", email: "alice@test.com" },
        { userId: "u2", name: "Bob", email: "bob@test.com" },
    ];

    // Bob paid 10, Alice owes 5
    const mockExpenses = [
        {
            id: "e1",
            amount: 10,
            paidBy: "u2",
            splits: [{ userId: "u1", amount: 5 }, { userId: "u2", amount: 5 }],
            date: new Date().toISOString(),
            category: "Food",
            description: "Lunch"
        }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        (useAppContext as any).mockReturnValue({ activeGroupId: "g1", currentUserId: "u1" });
        (useQuery as any).mockReturnValue({
            data: { members: mockMembers, expenses: mockExpenses, settlements: [] },
            isLoading: false
        });
    });

    it("Bug-003: passes correct user objects with 'userId' to SettlementModal", async () => {
        render(<Dashboard />);

        // Alice (u1) owes Bob (u2). Bob should be in the list with a 'Settle' button.
        const settleBtn = screen.getByTestId("button-settle-with-u2");
        fireEvent.click(settleBtn);

        await waitFor(() => {
            expect(mockSettlementModal).toHaveBeenCalled();
        });

        const lastCall = mockSettlementModal.mock.lastCall;
        if (!lastCall) {
            throw new Error("SettlementModal was not called");
        }
        const lastCallProps = lastCall[0];

        // Verify that the 'fromUser' object has 'userId' property, not just 'id'
        expect(lastCallProps.fromUser).toBeDefined();
        expect(lastCallProps.fromUser).toHaveProperty("userId", "u1");

        // Verify toUser as well
        expect(lastCallProps.toUser).toBeDefined();
        expect(lastCallProps.toUser).toHaveProperty("userId", "u2");
    });
});
