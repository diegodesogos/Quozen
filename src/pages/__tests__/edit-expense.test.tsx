import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import EditExpense from "../edit-expense";
import { useAppContext } from "@/context/app-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ConflictError } from "@/lib/errors";
import { googleApi } from "@/lib/drive";
import en from "@/locales/en/translation.json";

// Mocks
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

vi.mock("@/lib/drive", () => ({
  googleApi: {
    getGroupData: vi.fn(),
    updateExpense: vi.fn(),
  },
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock AlertDialog to avoid Radix UI portal/animation issues in JSDOM
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: any) => open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h1>{children}</h1>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ onClick, children }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogAction: ({ onClick, children }: any) => <button onClick={onClick}>{children}</button>,
}));

describe("Edit Expense Page", () => {
  // Update mockExpense to have valid splits matching amount (20)
  const mockExpense = {
    id: "exp1",
    description: "Lunch",
    amount: 20,
    paidBy: "user1",
    category: "Food",
    date: new Date().toISOString(),
    splits: [{ userId: "user1", amount: 20 }], // Valid split
    meta: { lastModified: "2023-01-01T10:00:00Z" },
    _rowIndex: 2
  };

  const mockGroupData = {
    members: [{ userId: "user1", name: "Alice" }],
    expenses: [mockExpense]
  };

  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      currentUserId: "user1",
    });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockGroupData,
      isLoading: false,
      refetch: vi.fn(),
    });

    (useMutation as unknown as ReturnType<typeof vi.fn>).mockImplementation((options) => ({
      mutate: async (data: any) => {
        try {
          if (options?.mutationFn) {
            await options.mutationFn(data);
          }
          if (options.onSuccess) options.onSuccess();
        } catch (e: any) {
          if (options.onError) {
            options.onError(e);
          }
        }
      },
      isPending: false,
    }));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders the edit form", () => {
    render(
      <MemoryRouter initialEntries={["/edit-expense/exp1"]}>
        <Routes>
          <Route path="/edit-expense/:id" element={<EditExpense />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByDisplayValue("Lunch")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    expect(screen.getByText(en.expenseForm.editTitle)).toBeInTheDocument();
  });

  it("shows Not Found dialog if expense does not exist", () => {
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { members: [], expenses: [] },
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/edit-expense/missing"]}>
        <Routes>
          <Route path="/edit-expense/:id" element={<EditExpense />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(en.expenseForm.notFoundTitle)).toBeInTheDocument();
    expect(screen.getByText(en.expenseForm.notFoundDesc)).toBeInTheDocument();
  });

  it("shows Conflict dialog on ConflictError during save", async () => {
    const conflictError = new ConflictError("Modified by someone else");
    conflictError.name = "ConflictError";
    (googleApi.updateExpense as any).mockRejectedValue(conflictError);

    render(
      <MemoryRouter initialEntries={["/edit-expense/exp1"]}>
        <Routes>
          <Route path="/edit-expense/:id" element={<EditExpense />} />
        </Routes>
      </MemoryRouter>
    );

    const saveBtn = screen.getByText(en.expenseForm.save);

    await act(async () => {
      fireEvent.click(saveBtn);
    });

    const conflictDialog = await screen.findByTestId("alert-dialog");
    expect(conflictDialog).toBeInTheDocument();
    expect(screen.getByText(en.expenseForm.conflictTitle)).toBeInTheDocument();

    // We check for the error message from the exception OR the description from translation
    expect(screen.getByText(/Modified by someone else/)).toBeInTheDocument();

    expect(mockToast).not.toHaveBeenCalled();
  });
});
