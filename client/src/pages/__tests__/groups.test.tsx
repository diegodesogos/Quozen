import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Groups from "../groups";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { useQuery, useMutation } from "@tanstack/react-query";

// Mock hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

vi.mock("@/context/auth-provider", () => ({
  useAuth: vi.fn(),
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

// Mock googleApi to avoid errors if code reaches it (though mutation is mocked)
vi.mock("@/lib/drive", () => ({
  googleApi: {
    listGroups: vi.fn(),
    createGroupSheet: vi.fn(),
  },
}));

describe("Groups Page", () => {
  const mockUser = { id: "user1", name: "Alice", email: "alice@example.com" };
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

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
    });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      const key = queryKey[0];
      
      // Handle the new drive-based query key
      if (key === "drive" && queryKey[1] === "groups") {
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
    expect(screen.getByText("Google Sheet")).toBeInTheDocument();
  });

  it("opens create group dialog and submits new group", async () => {
    render(<Groups />);
    
    // 1. Click "New Group"
    const newGroupBtn = screen.getByRole("button", { name: /New Group/i });
    fireEvent.click(newGroupBtn);

    // 2. Check dialog
    expect(screen.getByRole("heading", { name: "Create New Group" })).toBeInTheDocument();

    // 3. Fill form
    fireEvent.change(screen.getByLabelText(/Group Name/i), { target: { value: "New Team" } });

    // 4. Submit
    const submitBtn = screen.getByRole("button", { name: /Create Group/i });
    fireEvent.click(submitBtn);

    // 5. Verify mutation and side effects
    await waitFor(() => {
        // Since we are mocking useMutation, we check if the function passed to mutate was called with the right arg
        expect(mutateCreateGroup).toHaveBeenCalledWith("New Team");
    });

    // Should switch to the new group automatically on success
    expect(setActiveGroupId).toHaveBeenCalledWith("new-group-id");
  });
});
