import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AddExpense from "../add-expense";
import { useAppContext } from "@/context/app-context";
import { useQuery, useMutation } from "@tanstack/react-query";

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

// Mock googleApi
vi.mock("@/lib/drive", () => ({
  googleApi: {
    getGroupData: vi.fn(),
    addExpense: vi.fn(),
  },
}));

describe("Add Expense Page", () => {
  const mockGroupData = {
    members: [
      { userId: "user1", name: "Alice", email: "alice@example.com" },
      { userId: "user2", name: "Bob", email: "bob@example.com" },
    ]
  };

  const mutateAddExpense = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });

    // Always return the group data for the drive query
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockGroupData,
      isLoading: false,
      isSuccess: true,
    });

    (useMutation as unknown as ReturnType<typeof vi.fn>).mockImplementation((options) => {
      return {
        mutate: (data: any) => {
          mutateAddExpense(data);
          if (options?.onSuccess) options.onSuccess();
        },
        isPending: false,
      };
    });
  });

  it("renders the add expense form", async () => {
    render(<AddExpense />);
    
    // Wait for the data to load and items to render
    await screen.findByTestId("split-item-user2");

    expect(screen.getByRole("heading", { name: "Add Expense" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
    expect(screen.getByText("Split Between")).toBeInTheDocument();
    
    const splitListAlice = screen.getByTestId("split-item-user1");
    expect(within(splitListAlice).getByText("You")).toBeInTheDocument();
    
    const splitListBob = screen.getByTestId("split-item-user2");
    expect(within(splitListBob).getByText("Bob")).toBeInTheDocument();
  });

  it("calculates equal splits automatically when amount changes", async () => {
    render(<AddExpense />);
    
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
    
    await screen.findByTestId("split-item-user2");

    fireEvent.change(screen.getByTestId("input-expense-description"), { target: { value: "Dinner" } });
    fireEvent.change(screen.getByTestId("input-expense-amount"), { target: { value: "100" } });
    
    // Select Category
    const categoryTrigger = screen.getByTestId("select-category");
    fireEvent.click(categoryTrigger);
    const option = await screen.findByRole("option", { name: "Food & Dining" });
    fireEvent.click(option);

    const submitBtn = screen.getByTestId("button-submit-expense");
    fireEvent.click(submitBtn);

    await waitFor(() => {
        expect(mutateAddExpense).toHaveBeenCalledWith(expect.objectContaining({
            description: "Dinner",
            amount: 100,
            category: "Food & Dining",
            splits: expect.arrayContaining([
                { userId: "user1", amount: 50 },
                { userId: "user2", amount: 50 }
            ])
        }));
    });

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});
