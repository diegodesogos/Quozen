import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Expenses from "../expenses";
import { useAppContext } from "@/context/app-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Mock hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
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
    deleteExpense: vi.fn(),
  },
}));

describe("Expenses Page", () => {
  // Mock Data
  const mockUsers = [
    { userId: "user1", name: "Alice", email: "alice@example.com", role: "member", joinedAt: new Date().toISOString() },
    { userId: "user2", name: "Bob", email: "bob@example.com", role: "member", joinedAt: new Date().toISOString() },
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
      meta: { createdAt: new Date().toISOString() },
      _rowIndex: 2,
    },
    {
      id: "exp2",
      description: "Uber",
      amount: 15.00,
      paidBy: "user2",
      category: "Transportation",
      date: new Date().toISOString(),
      splits: [{ userId: "user1", amount: 7.5 }, { userId: "user2", amount: 7.5 }],
      meta: { createdAt: new Date().toISOString() },
      _rowIndex: 3,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default App Context
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });
  });

  it("renders the list of expenses", () => {
    render(
      <MemoryRouter>
        <Expenses expenses={mockExpenses} members={mockUsers} />
      </MemoryRouter>
    );

    expect(screen.getByText("Grocery Run")).toBeInTheDocument();
    expect(screen.getByText("Uber")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("$15.00")).toBeInTheDocument();
  });

  it("calculates 'You paid' and 'You owe' correctly", () => {
    render(
      <MemoryRouter>
        <Expenses expenses={mockExpenses} members={mockUsers} />
      </MemoryRouter>
    );

    // User1 (Alice) paid for Grocery Run ($50)
    const groceryCard = screen.getByTestId("card-expense-exp1");
    expect(groceryCard).toHaveTextContent("You paid");

    // User2 (Bob) paid for Uber ($15). Alice's split is 7.5
    const uberCard = screen.getByTestId("card-expense-exp2");
    expect(uberCard).toHaveTextContent("You owe $7.50");
  });

  it("shows placeholder for delete button click", () => {
    render(
      <MemoryRouter>
        <Expenses expenses={mockExpenses} members={mockUsers} />
      </MemoryRouter>
    );
    const deleteBtn = screen.getByTestId("button-delete-expense-exp1");
    fireEvent.click(deleteBtn);

    // Check that AlertDialog appears
    expect(screen.getByText(/Delete Expense\?/i)).toBeInTheDocument();
  });

  it("triggers navigation when edit button is clicked", () => {
    render(
      <MemoryRouter>
        <Expenses expenses={mockExpenses} members={mockUsers} />
      </MemoryRouter>
    );
    const editBtn = screen.getByTestId("button-edit-expense-exp1");
    fireEvent.click(editBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/edit-expense/exp1");
  });
});
