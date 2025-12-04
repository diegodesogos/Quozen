import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Expenses from "../expenses";
import { useAppContext } from "@/context/app-context";
import { useQuery, useMutation } from "@tanstack/react-query";

// Mock hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

// Fix: Use importOriginal to preserve QueryClient class and other exports
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
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

describe("Expenses Page", () => {
  // Mock Data
  const mockUsers = [
    { id: "user1", name: "Alice", email: "alice@example.com" },
    { id: "user2", name: "Bob", email: "bob@example.com" },
  ];

  const mockExpenses = [
    {
      id: "exp1",
      description: "Grocery Run",
      amount: "50.00",
      paidBy: "user1",
      category: "Food",
      date: new Date().toISOString(),
      splits: [{ userId: "user1", amount: 25 }, { userId: "user2", amount: 25 }],
    },
    {
      id: "exp2",
      description: "Uber",
      amount: "15.00",
      paidBy: "user2",
      category: "Transportation",
      date: new Date().toISOString(),
      splits: [{ userId: "user1", amount: 7.5 }, { userId: "user2", amount: 7.5 }],
    },
  ];

  // Spies for mutations
  const mutateDelete = vi.fn();
  const mutateUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default App Context
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });

    // Mock useQuery
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      const key = queryKey[0];
      
      if (key === "/api/users") {
        return { data: mockUsers };
      }
      
      if (key === "/api/groups" && queryKey[2] === "expenses") {
        return { data: mockExpenses };
      }
      
      return { data: [] };
    });

    // Mock useMutation
    (useMutation as unknown as ReturnType<typeof vi.fn>).mockImplementation((options) => {
      return {
        mutate: (args: any) => {
            if (typeof args === 'string') {
                mutateDelete(args);
            } else {
                mutateUpdate(args);
            }
            if (options?.onSuccess) options.onSuccess();
        },
        isPending: false,
      };
    });

    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  it("triggers delete mutation when delete button is clicked and confirmed", () => {
    render(<Expenses />);
    
    const deleteBtn = screen.getByTestId("button-delete-expense-exp1");
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mutateDelete).toHaveBeenCalledWith("exp1");
  });

  it("opens edit dialog and submits update", async () => {
    render(<Expenses />);
    
    const editBtn = screen.getByTestId("button-edit-expense-exp1");
    fireEvent.click(editBtn);

    expect(screen.getByTestId("dialog-edit-expense")).toBeInTheDocument();
    
    const descInput = screen.getByTestId("input-expense-description");
    fireEvent.change(descInput, { target: { value: "Grocery Run Updated" } });

    const saveBtn = screen.getByTestId("button-save-expense");
    fireEvent.click(saveBtn);

    await waitFor(() => {
        expect(mutateUpdate).toHaveBeenCalledWith(expect.objectContaining({
            id: "exp1",
            description: "Grocery Run Updated"
        }));
    });
  });
});
