import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ExpensesList from "../expenses";
import { useAppContext } from "@/context/app-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";
import en from "@/locales/en/translation.json";
import { formatCurrency } from "@/lib/format-currency";

vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettings: vi.fn(),
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

vi.mock("@/lib/drive", () => ({
  googleApi: {
    getGroupData: vi.fn(),
    deleteExpense: vi.fn(),
  },
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
  DropdownMenuContent: ({ children }: any) => <>{children}</>,
  DropdownMenuItem: ({ children, onClick }: any) => <div onClick={onClick} role="menuitem">{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

describe("Expenses Page", () => {
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
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });
    (useSettings as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: { preferences: { defaultCurrency: "USD" } }
    });
  });

  it("renders the list of expenses", () => {
    render(
      <MemoryRouter>
        <ExpensesList expenses={mockExpenses} members={mockUsers} />
      </MemoryRouter>
    );

    expect(screen.getByText("Grocery Run")).toBeInTheDocument();
    expect(screen.getByText("Uber")).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(50))).toBeInTheDocument();
  });

  it("calculates 'You paid' and 'You owe' correctly", () => {
    render(
      <MemoryRouter>
        <ExpensesList expenses={mockExpenses} members={mockUsers} />
      </MemoryRouter>
    );

    const groceryCard = screen.getByTestId("card-expense-exp1");
    expect(groceryCard).toHaveTextContent(en.expenseItem.paid);

    const uberCard = screen.getByTestId("card-expense-exp2");
    // "You owe {{amount}}"
    const expectedOweText = en.expenseItem.owe.replace("{{amount}}", formatCurrency(7.5));
    expect(uberCard).toHaveTextContent(expectedOweText);
  });

  it("shows placeholder for delete button click", () => {
    render(
      <MemoryRouter>
        <ExpensesList expenses={mockExpenses} members={mockUsers} />
      </MemoryRouter>
    );
    const expenseCard = screen.getByTestId("card-expense-exp1");
    const deleteBtn = within(expenseCard).getByText(en.common.delete);
    fireEvent.click(deleteBtn);

    expect(screen.getByText(en.expenseItem.deleteTitle)).toBeInTheDocument();
  });

  it("triggers navigation when edit button is clicked", () => {
    render(
      <MemoryRouter>
        <ExpensesList expenses={mockExpenses} members={mockUsers} />
      </MemoryRouter>
    );
    const expenseCard = screen.getByTestId("card-expense-exp1");
    const editBtn = within(expenseCard).getByText(en.common.edit);
    fireEvent.click(editBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/edit-expense/exp1");
  });
});
