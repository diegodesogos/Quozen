import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Dashboard from "../dashboard";
import { useAppContext } from "@/context/app-context";
import { useQuery } from "@tanstack/react-query";

// Mock the context and query hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

// Mock the SettlementModal to verify it opens with correct props
vi.mock("@/components/settlement-modal", () => ({
  default: ({ isOpen, onClose, fromUser, toUser, suggestedAmount }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="mock-settlement-modal">
        <button onClick={onClose}>Close</button>
        <div>From: {fromUser?.name}</div>
        <div>To: {toUser?.name}</div>
        <div>Amount: {suggestedAmount}</div>
      </div>
    );
  },
}));

describe("Dashboard Page", () => {
  // Mock Data
  const mockUsers = [
    { id: "user1", name: "Alice", email: "alice@example.com" },
    { id: "user2", name: "Bob", email: "bob@example.com" },
  ];

  const mockGroup = {
    id: "group1",
    name: "Test Group",
    participants: ["user1", "user2"],
  };

  const mockExpenses = [
    {
      id: "exp1",
      description: "Lunch",
      amount: "20.00",
      paidBy: "user2",
      category: "Food",
      date: new Date().toISOString(),
      splits: [{ userId: "user1", amount: 10 }, { userId: "user2", amount: 10 }],
    },
  ];

  const mockBalances = {
    user1: -10, // Alice owes 10
    user2: 10,  // Bob is owed 10
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns for AppContext
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });

    // Setup mock returns for useQuery based on queryKey
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      const key = queryKey[0];
      
      // Users Data
      if (key === "/api/users") {
        return { data: mockUsers };
      }

      // Group Data - STRICT CHECK: Ensure length is 2 to avoid matching expenses/balances
      if (key === "/api/groups" && queryKey.length === 2 && queryKey[1] === "group1") {
        return { data: mockGroup };
      }
      
      // Expenses Data
      if (key === "/api/groups" && queryKey[2] === "expenses") {
        return { data: mockExpenses };
      }
      
      // Balances Data
      if (key === "/api/groups" && queryKey[2] === "balances") {
        return { data: mockBalances };
      }
      
      return { data: undefined };
    });
  });

  it("renders dashboard with correct user balance", () => {
    render(<Dashboard />);
    
    // Alice (user1) owes 10. Dashboard displays absolute value: "$10.00"
    expect(screen.getByTestId("dashboard-view")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("You owe overall")).toBeInTheDocument();
  });

  it("renders group balances correctly", () => {
    render(<Dashboard />);
    
    // Bob (user2) is owed 10, so it should show +$10.00
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByTestId("text-balance-user2")).toHaveTextContent("+$10.00");
  });

  it("renders recent expenses", () => {
    render(<Dashboard />);
    
    expect(screen.getByText("Recent Expenses")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    // Use regex because the text includes the date: "Paid by Bob • 12/04/2025"
    expect(screen.getByText(/Paid by Bob/)).toBeInTheDocument();
  });

  it("opens settlement modal with correct suggestion when 'Settle Up' is clicked", () => {
    render(<Dashboard />);
    
    const settleUpBtn = screen.getByTestId("button-settle-up");
    fireEvent.click(settleUpBtn);

    // Check if our mock modal appeared
    expect(screen.getByTestId("mock-settlement-modal")).toBeInTheDocument();
    
    // Logic: Alice owes 10, Bob is owed 10. System suggests Alice pays Bob 10.
    expect(screen.getByText("From: Alice")).toBeInTheDocument();
    expect(screen.getByText("To: Bob")).toBeInTheDocument();
    expect(screen.getByText("Amount: 10")).toBeInTheDocument();
  });
});
