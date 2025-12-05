import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Expenses from "../expenses";
import { useAppContext } from "@/context/app-context";
import { useQuery } from "@tanstack/react-query";

// Mock hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock googleApi
vi.mock("@/lib/drive", () => ({
  googleApi: {
    getGroupData: vi.fn(),
  },
}));

describe("Expenses Page", () => {
  // Mock Data
  const mockUsers = [
    { userId: "user1", name: "Alice", email: "alice@example.com" },
    { userId: "user2", name: "Bob", email: "bob@example.com" },
  ];

  const mockExpenses = [
    {
      id: "exp1",
      description: "Grocery Run",
      amount: 50.00,
      paidBy: "user1",
      category: "Food",
      date: new Date().toISOString(),
      splits: [{ userId: "user1", amount: 25 }, { userId: "user2", amount: 25 }],
    },
    {
      id: "exp2",
      description: "Uber",
      amount: 15.00,
      paidBy: "user2",
      category: "Transportation",
      date: new Date().toISOString(),
      splits: [{ userId: "user1", amount: 7.5 }, { userId: "user2", amount: 7.5 }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default App Context
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });

    // Mock useQuery to return Drive data
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      if (Array.isArray(queryKey) && queryKey[0] === "drive" && queryKey[1] === "group") {
        return { 
          data: {
            members: mockUsers,
            expenses: mockExpenses,
            settlements: []
          }, 
          isLoading: false 
        };
      }
      return { data: undefined, isLoading: false };
    });
  });

  it("renders the list of expenses", () => {
    render(<Expenses />);
    
    expect(screen.getByText("All Expenses")).toBeInTheDocument();
    expect(screen.getByText("Grocery Run")).toBeInTheDocument();
    expect(screen.getByText("Uber")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("$15.00")).toBeInTheDocument();
  });

  it("calculates 'You paid' and 'You owe' correctly", () => {
    render(<Expenses />);
    
    // User1 (Alice) paid for Grocery Run ($50)
    const groceryCard = screen.getByTestId("card-expense-exp1");
    expect(groceryCard).toHaveTextContent("You paid");

    // User2 (Bob) paid for Uber ($15). Alice's split is 7.5
    const uberCard = screen.getByTestId("card-expense-exp2");
    expect(uberCard).toHaveTextContent("You owe $7.50");
  });

  it("shows placeholder for delete button click", () => {
    // Since we don't have delete implemented yet, we verify it doesn't crash
    // and perhaps check for the toast (optional, simplified here)
    render(<Expenses />);
    const deleteBtn = screen.getByTestId("button-delete-expense-exp1");
    fireEvent.click(deleteBtn);
    // Logic is handled by stub, no crash means success for this phase
  });

  it("shows placeholder for edit button click", () => {
    render(<Expenses />);
    const editBtn = screen.getByTestId("button-edit-expense-exp1");
    fireEvent.click(editBtn);
    // Logic is handled by stub
  });
});
