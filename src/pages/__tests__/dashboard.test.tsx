import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Dashboard from "../dashboard";
import { useAppContext } from "@/context/app-context";
import { useQuery } from "@tanstack/react-query";

// Mock the context and query hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({ mutate: vi.fn() })), // Mock mutation
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  };
});

// Mock navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock the SettlementModal
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

// Mock googleApi
vi.mock("@/lib/drive", () => ({
  googleApi: {
    getGroupData: vi.fn(),
    addSettlement: vi.fn(),
  },
}));

describe("Dashboard Page", () => {
  // Mock Data conforming to Google Sheet structure
  const mockMembers = [
    { userId: "user1", name: "Alice", email: "alice@example.com" },
    { userId: "user2", name: "Bob", email: "bob@example.com" },
  ];

  const mockExpenses = [
    {
      id: "exp1",
      description: "Lunch",
      amount: 20.00,
      paidBy: "user2",
      category: "Food",
      date: new Date().toISOString(),
      splits: [{ userId: "user1", amount: 10 }, { userId: "user2", amount: 10 }],
    },
  ];

  // Bob paid 20. Split 10/10.
  // Alice owes 10 to Bob.
  // Alice Balance: -10
  // Bob Balance: +10

  beforeEach(() => {
    vi.clearAllMocks();

    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      // Check for the Drive query
      if (Array.isArray(queryKey) && queryKey[0] === "drive" && queryKey[1] === "group") {
        return { 
          data: {
            members: mockMembers,
            expenses: mockExpenses,
            settlements: []
          },
          isLoading: false 
        };
      }
      
      return { data: undefined, isLoading: false };
    });
  });

  it("renders dashboard with calculated user balance", () => {
    render(<Dashboard />);
    
    // Alice (user1) owes 10. Dashboard displays absolute value with correct wording.
    // userBalance = -10
    expect(screen.getByTestId("dashboard-view")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("You owe overall")).toBeInTheDocument();
  });

  it("renders calculated group balances correctly", () => {
    render(<Dashboard />);
    
    // Bob (user2) is owed 10.
    expect(screen.getByText("Bob")).toBeInTheDocument();
    // Text should include "+$10.00"
    expect(screen.getByTestId("text-balance-user2")).toHaveTextContent("+$10.00");
  });

  it("renders recent expenses", () => {
    render(<Dashboard />);
    
    expect(screen.getByText("Recent Expenses")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText(/Paid by Bob/)).toBeInTheDocument();
  });

  it("opens settlement modal with correct suggestion when 'Settle Up' is clicked", () => {
    render(<Dashboard />);
    
    const settleUpBtn = screen.getByTestId("button-settle-up");
    fireEvent.click(settleUpBtn);

    expect(screen.getByTestId("mock-settlement-modal")).toBeInTheDocument();
    
    // Alice (-10) should pay Bob (+10). Amount 10.
    expect(screen.getByText("From: Alice")).toBeInTheDocument();
    expect(screen.getByText("To: Bob")).toBeInTheDocument();
    expect(screen.getByText("Amount: 10")).toBeInTheDocument();
  });
});
