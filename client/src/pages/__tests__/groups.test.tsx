import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Groups from "../groups";
import { useAppContext } from "@/context/app-context";
import { useQuery, useMutation } from "@tanstack/react-query";

// Mock hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

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

describe("Groups Page", () => {
  const mockUsers = [
    { id: "user1", name: "Alice", email: "alice@example.com" },
    { id: "user2", name: "Bob", email: "bob@example.com" },
  ];

  const mockGroups = [
    {
      id: "group1",
      name: "Trip to Paris",
      description: "Summer vacation",
      createdBy: "user1",
      participants: ["user1", "user2"],
      createdAt: new Date().toISOString(),
    },
  ];

  const mockExpenses = [
    { amount: "100.00" },
    { amount: "50.00" }
  ];

  const mutateCreateGroup = vi.fn();
  const setActiveGroupId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeGroupId: "group1",
      setActiveGroupId,
      currentUserId: "user1",
    });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      const key = queryKey[0];
      
      if (key === "/api/users" && queryKey.length === 1) {
        return { data: mockUsers };
      }
      
      if (key === "/api/users" && queryKey[2] === "groups") {
        return { data: mockGroups };
      }

      if (key === "/api/groups" && queryKey[2] === "expenses") {
        return { data: mockExpenses };
      }
      
      return { data: [] };
    });

    (useMutation as unknown as ReturnType<typeof vi.fn>).mockImplementation((options) => {
      return {
        mutate: (data: any) => {
          mutateCreateGroup(data);
          // Simulate success response containing the new group ID
          if (options?.onSuccess) options.onSuccess({ id: "new-group-id" });
        },
        isPending: false,
      };
    });
  });

  it("renders the list of groups", () => {
    render(<Groups />);
    
    expect(screen.getByText("Your Groups")).toBeInTheDocument();
    expect(screen.getByText("Trip to Paris")).toBeInTheDocument();
    expect(screen.getByText("Summer vacation")).toBeInTheDocument();
    // 2 members
    expect(screen.getByText(/2 members/)).toBeInTheDocument();
    // Total spent calculation (100 + 50)
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });

  it("opens create group dialog and submits new group", async () => {
    render(<Groups />);
    
    // 1. Click "New Group"
    const newGroupBtn = screen.getByTestId("button-create-group");
    fireEvent.click(newGroupBtn);

    // 2. Check dialog
    expect(screen.getByTestId("modal-create-group")).toBeInTheDocument();

    // 3. Fill form
    fireEvent.change(screen.getByTestId("input-group-name"), { target: { value: "New Team" } });
    fireEvent.change(screen.getByTestId("textarea-group-description"), { target: { value: "Work stuff" } });
    fireEvent.change(screen.getByTestId("textarea-participant-emails"), { target: { value: "bob@example.com" } });

    // 4. Submit
    const submitBtn = screen.getByTestId("button-submit-create-group");
    fireEvent.click(submitBtn);

    // 5. Verify mutation and side effects
    await waitFor(() => {
        expect(mutateCreateGroup).toHaveBeenCalledWith(expect.objectContaining({
            name: "New Team",
            description: "Work stuff",
            participants: expect.arrayContaining(["user1", "user2"]) // user1 is creator, user2 is bob found by email
        }));
    });

    // Should switch to the new group automatically on success
    expect(setActiveGroupId).toHaveBeenCalledWith("new-group-id");
  });
});
