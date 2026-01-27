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

// Mock googleApi
vi.mock("@/lib/drive", () => ({
  googleApi: {
    listGroups: vi.fn(),
    createGroupSheet: vi.fn(),
    getGroupData: vi.fn(),
    deleteGroup: vi.fn(),
    leaveGroup: vi.fn(),
  },
}));

// Import the mocked api to spy on it
import { googleApi } from "@/lib/drive";

describe("Groups Page", () => {
  const mockUser = { id: "user1", name: "Alice", email: "alice@example.com" };
  const mockGroups = [
    {
      id: "group1",
      name: "Trip to Paris",
      description: "Summer vacation",
      createdBy: "me",
      participants: ["user1", "user2"],
      createdAt: new Date().toISOString(),
      isOwner: true, // Owner
    },
    {
      id: "group2",
      name: "Office Lunch",
      description: "Work stuff",
      createdBy: "Boss",
      participants: ["user1", "user3"],
      createdAt: new Date().toISOString(),
      isOwner: false, // Member
    }
  ];

  const mutateCreateGroup = vi.fn();
  const mutateDeleteGroup = vi.fn();
  const mutateLeaveGroup = vi.fn();
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

      if (key === "drive" && queryKey[1] === "groups") {
        return { data: mockGroups };
      }
      return { data: [] };
    });

    // Mock mutations
    (useMutation as unknown as ReturnType<typeof vi.fn>).mockImplementation((options) => {
      return {
        mutate: (data: any) => {
            if (options?.mutationFn) options.mutationFn(data);
            if (options?.onSuccess) options.onSuccess(data);
        },
        isPending: false,
      };
    });
  });

  it("renders the list of groups with correct badges", () => {
    render(<Groups />);

    expect(screen.getByText("Your Groups")).toBeInTheDocument();
    
    // Group 1 - Owner
    expect(screen.getByText("Trip to Paris")).toBeInTheDocument();
    const group1Card = screen.getByText("Trip to Paris").closest('.rounded-lg');
    expect(group1Card).toHaveTextContent("Owner");
    expect(group1Card).toHaveTextContent("Active");

    // Group 2 - Member
    expect(screen.getByText("Office Lunch")).toBeInTheDocument();
    const group2Card = screen.getByText("Office Lunch").closest('.rounded-lg');
    expect(group2Card).toHaveTextContent("Member");
    expect(group2Card).not.toHaveTextContent("Owner");
  });

  it("shows Edit/Delete for owners and Leave for members", () => {
    render(<Groups />);

    // Group 1 (Owner) should have Edit and Delete (trash icon)
    const group1Card = screen.getByText("Trip to Paris").closest('.rounded-lg');
    expect(group1Card?.querySelector('button svg.lucide-pencil')).toBeInTheDocument(); // Edit
    expect(group1Card?.querySelector('button svg.lucide-trash2')).toBeInTheDocument(); // Delete
    expect(group1Card?.querySelector('button svg.lucide-log-out')).not.toBeInTheDocument(); // No Leave

    // Group 2 (Member) should have Leave (log-out icon)
    const group2Card = screen.getByText("Office Lunch").closest('.rounded-lg');
    expect(group2Card?.querySelector('button svg.lucide-pencil')).not.toBeInTheDocument(); // No Edit
    expect(group2Card?.querySelector('button svg.lucide-trash2')).not.toBeInTheDocument(); // No Delete
    expect(group2Card?.querySelector('button svg.lucide-log-out')).toBeInTheDocument(); // Leave
  });

  it("opens delete confirmation and triggers mutation", async () => {
    render(<Groups />);

    // Click Delete on Group 1
    const group1Card = screen.getByText("Trip to Paris").closest('.rounded-lg');
    const deleteBtn = group1Card!.querySelector('button svg.lucide-trash2')!.closest('button')!;
    fireEvent.click(deleteBtn);

    // Dialog should appear
    // Use specific matcher to avoid finding the group name in the background list
    expect(screen.getByText((content) => content.includes('Are you sure you want to delete "Trip to Paris"?'))).toBeInTheDocument();

    // Click Confirm
    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    // Verify API called
    expect(googleApi.deleteGroup).toHaveBeenCalledWith("group1");
  });

  it("opens leave confirmation and triggers mutation", async () => {
    render(<Groups />);

    // Click Leave on Group 2
    const group2Card = screen.getByText("Office Lunch").closest('.rounded-lg');
    const leaveBtn = group2Card!.querySelector('button svg.lucide-log-out')!.closest('button')!;
    fireEvent.click(leaveBtn);

    // Dialog should appear
    expect(screen.getByText((content) => content.includes('Are you sure you want to leave "Office Lunch"?'))).toBeInTheDocument();

    // Click Confirm
    const confirmBtn = screen.getByRole("button", { name: "Leave" });
    fireEvent.click(confirmBtn);

    // Verify API called
    expect(googleApi.leaveGroup).toHaveBeenCalledWith("group2", "user1");
  });
});
