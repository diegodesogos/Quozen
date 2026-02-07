import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettlementModal from "../settlement-modal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";

// Mock hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(() => ({ activeGroupId: "group1" })),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: vi.fn(),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  };
});

// Mock Google API
vi.mock("@/lib/drive", () => ({
  googleApi: {
    addSettlement: vi.fn(),
  },
}));

// Mock UI components for JSDOM compatibility
// We strictly mock Select to render a native <select> with <option> children
// This ensures fireEvent.change and toHaveValue work correctly
vi.mock("@/components/ui/select", () => ({
  Select: ({ onValueChange, value, children }: any) => (
    <div data-testid="mock-select-wrapper">
      <select 
        onChange={(e) => onValueChange(e.target.value)} 
        value={value}
        data-testid="real-select"
      >
        {children}
      </select>
    </div>
  ),
  // SelectTrigger is visual only, we don't want it inside the <select> DOM in our mock structure
  SelectTrigger: () => null, 
  SelectValue: () => null,
  // SelectContent usually contains items; we strip the wrapper to put options directly in select
  SelectContent: ({ children }: any) => <>{children}</>, 
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

describe("SettlementModal", () => {
  const mockUsers = [
    { userId: "u1", name: "Alice", email: "", role: "member", joinedAt: "" },
    { userId: "u2", name: "Bob", email: "", role: "member", joinedAt: "" },
    { userId: "u3", name: "Charlie", email: "", role: "member", joinedAt: "" },
  ];

  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useMutation as any).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    fromUser: { userId: "u1", name: "Alice" },
    toUser: { userId: "u2", name: "Bob" },
    suggestedAmount: 50,
    users: mockUsers, 
  };

  it("renders with initial suggested values", () => {
    render(<SettlementModal {...defaultProps} />);

    expect(screen.getByText("Settle Balance")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50.00")).toBeInTheDocument();
    
    const selects = screen.getAllByTestId("real-select");
    expect(selects[0]).toHaveValue("u1"); // From (Payer)
    expect(selects[1]).toHaveValue("u2"); // To (Receiver)
  });

  it("allows changing the payer and receiver", () => {
    render(<SettlementModal {...defaultProps} />);

    const selects = screen.getAllByTestId("real-select");
    const fromSelect = selects[0];
    // const toSelect = selects[1];

    // Change Payer to Charlie (u3)
    fireEvent.change(fromSelect, { target: { value: "u3" } });
    
    // Submit
    const submitBtn = screen.getByTestId("button-record-payment");
    fireEvent.click(submitBtn);

    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({
      fromUserId: "u3",
      toUserId: "u2",
      amount: 50
    }));
  });

  it("validates that payer and receiver cannot be the same person", () => {
    render(<SettlementModal {...defaultProps} />);

    const selects = screen.getAllByTestId("real-select");
    const fromSelect = selects[0]; // Alice

    // Change Payer to Bob (u2) - Same as Receiver
    fireEvent.change(fromSelect, { target: { value: "u2" } });

    const submitBtn = screen.getByTestId("button-record-payment");
    fireEvent.click(submitBtn);

    // Should NOT submit
    expect(mockMutate).not.toHaveBeenCalled();

    // Should show error toast
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Invalid selection",
      variant: "destructive"
    }));
  });
});
