import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AddExpense from "../add-expense";
import { useAppContext } from "@/context/app-context";
import { useQuery, useMutation } from "@tanstack/react-query";

// Mock hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

// Mock router navigation
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

describe("Add Expense Page", () => {
  const mockUsers = [
    { id: "user1", name: "Alice", email: "alice@example.com" },
    { id: "user2", name: "Bob", email: "bob@example.com" },
  ];

  const mockGroup = {
    id: "group1",
    name: "Test Group",
    participants: ["user1", "user2"],
  };

  const mutateCreateExpense = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      const key = queryKey[0];
      
      if (key === "/api/users") {
        return { data: mockUsers };
      }
      
      if (key === "/api/groups" && queryKey[1] === "group1") {
        return { data: mockGroup };
      }
      
      return { data: undefined };
    });

    (useMutation as unknown as ReturnType<typeof vi.fn>).mockImplementation((options) => {
      return {
        mutate: (data: any) => {
          mutateCreateExpense(data);
          if (options?.onSuccess) options.onSuccess();
        },
        isPending: false,
      };
    });
  });

  it("renders the add expense form", async () => {
    render(<AddExpense />);
    
    // Wait for the split item to appear (indicates data loaded)
    // We use the test ID to be specific and avoid ambiguity
    await screen.findByTestId("split-item-user2");

    expect(screen.getByRole("heading", { name: "Add Expense" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
    expect(screen.getByText("Split Between")).toBeInTheDocument();
    
    // Check for "You" in the split list specifically
    const splitListAlice = screen.getByTestId("split-item-user1");
    expect(within(splitListAlice).getByText("You")).toBeInTheDocument();
    
    // Check for "Bob" in the split list specifically
    const splitListBob = screen.getByTestId("split-item-user2");
    expect(within(splitListBob).getByText("Bob")).toBeInTheDocument();
  });

  it("calculates equal splits automatically when amount changes", async () => {
    render(<AddExpense />);
    
    // Wait for data load via specific test ID
    await screen.findByTestId("split-item-user2");

    const amountInput = screen.getByTestId("input-expense-amount");
    fireEvent.change(amountInput, { target: { value: "100" } });

    await waitFor(() => {
        const splitInputs = screen.getAllByTestId(/input-split-amount-/);
        expect(splitInputs[0]).toHaveValue(50);
        expect(splitInputs[1]).toHaveValue(50);
    });
  });

  it("submits the form successfully", async () => {
    render(<AddExpense />);
    
    // Wait for data load
    await screen.findByTestId("split-item-user2");

    // 1. Fill basic info
    fireEvent.change(screen.getByTestId("input-expense-description"), { target: { value: "Dinner" } });
    fireEvent.change(screen.getByTestId("input-expense-amount"), { target: { value: "100" } });
    
    // 2. Select Category
    const categoryTrigger = screen.getByTestId("select-category");
    fireEvent.click(categoryTrigger);
    
    // Use findByRole('option') to get the specific dropdown item from the Portal
    const option = await screen.findByRole("option", { name: "Food & Dining" });
    fireEvent.click(option);

    // 3. Submit
    const submitBtn = screen.getByTestId("button-submit-expense");
    fireEvent.click(submitBtn);

    // 4. Verify mutation
    await waitFor(() => {
        expect(mutateCreateExpense).toHaveBeenCalledWith(expect.objectContaining({
            description: "Dinner",
            amount: "100.00",
            category: "Food & Dining",
            splits: expect.arrayContaining([
                { userId: "user1", amount: 50 },
                { userId: "user2", amount: 50 }
            ])
        }));
    });

    // 5. Verify redirect
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});
