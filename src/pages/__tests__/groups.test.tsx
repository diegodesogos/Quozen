import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Groups from "../groups";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { useQuery, useMutation } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";
import { useSettings } from "@/hooks/use-settings";
import { useGroups } from "@/hooks/use-groups";

// Mock hooks
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

vi.mock("@/context/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettings: vi.fn(),
}));

vi.mock("@/hooks/use-groups", () => ({
  useGroups: vi.fn(),
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

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock googleApi
vi.mock("@/lib/drive", () => ({
  googleApi: {
    listGroups: vi.fn(),
    createGroupSheet: vi.fn(),
    getGroupData: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    leaveGroup: vi.fn(),
    checkMemberHasExpenses: vi.fn(),
  },
}));

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

  const mockGroup1Data = {
    members: [
      { userId: "user1", role: "owner", name: "Alice", email: "alice@example.com" }, // Changed to owner
      { userId: "user2", role: "member", name: "Bob", email: "bob@example.com" }
    ]
  };

  const mockUpdateSettings = vi.fn();
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

    (useSettings as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: {
        groupCache: [
          { id: "group1", name: "Trip to Paris", role: "owner" },
          { id: "group2", name: "Office Lunch", role: "member" }
        ],
        activeGroupId: "group1"
      },
      updateSettings: mockUpdateSettings
    });

    (useGroups as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      groups: mockGroups,
      isLoading: false
    });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      // It might query individual group data on edit click, but listGroups is handled by useGroups now.
      return { data: undefined };
    });

    // Mock mutations
    (useMutation as unknown as ReturnType<typeof vi.fn>).mockImplementation((options) => {
      return {
        mutate: async (data: any) => {
          try {
            if (options?.mutationFn) await options.mutationFn(data);
            if (options?.onSuccess) options.onSuccess(data);
          } catch (e: any) {
            if (options?.onError) options.onError(e);
          }
        },
        isPending: false,
      };
    });
  });

  it("renders the list of groups with correct badges", () => {
    render(<Groups />);
    expect(screen.getByText("Your Groups")).toBeInTheDocument();

    // Group 1 - Owner
    const group1Card = screen.getByText("Trip to Paris").closest('.rounded-lg');
    expect(group1Card).toHaveTextContent("Owner");

    // Group 2 - Member
    const group2Card = screen.getByText("Office Lunch").closest('.rounded-lg');
    expect(group2Card).toHaveTextContent("Member");
  });

  it("shows Edit/Delete for owners and Leave for members", () => {
    render(<Groups />);
    const group1Card = screen.getByText("Trip to Paris").closest('.rounded-lg');
    expect(group1Card?.querySelector('button svg.lucide-pencil')).toBeInTheDocument();
    expect(group1Card?.querySelector('button svg.lucide-trash2')).toBeInTheDocument();

    const group2Card = screen.getByText("Office Lunch").closest('.rounded-lg');
    expect(group2Card?.querySelector('button svg.lucide-log-out')).toBeInTheDocument();
  });

  it("prevents removing a member with existing expenses during edit", async () => {
    (googleApi.getGroupData as any).mockResolvedValue(mockGroup1Data);
    (googleApi.checkMemberHasExpenses as any).mockResolvedValue(true);

    render(<Groups />);

    const group1Card = screen.getByText("Trip to Paris").closest('.rounded-lg');
    const editBtn = group1Card!.querySelector('button svg.lucide-pencil')!.closest('button')!;
    fireEvent.click(editBtn);

    await waitFor(() => expect(screen.getByText("Edit Group")).toBeInTheDocument());

    const membersInput = screen.getByLabelText("Members (Optional)");
    fireEvent.change(membersInput, { target: { value: "" } });

    const saveBtn = screen.getByRole("button", { name: "Update Group" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Update Failed",
        // UPDATED: Matched the error message from Groups.tsx
        description: expect.stringContaining("Cannot remove Bob because they have expenses"),
        variant: "destructive"
      }));
    });

    expect(googleApi.updateGroup).not.toHaveBeenCalled();
  });

  it("prevents leaving a group if user has expenses", async () => {
    (googleApi.leaveGroup as any).mockRejectedValue(new Error("Cannot leave group while involved in expenses."));

    render(<Groups />);

    const group2Card = screen.getByText("Office Lunch").closest('.rounded-lg');
    const leaveBtn = group2Card!.querySelector('button svg.lucide-log-out')!.closest('button')!;
    fireEvent.click(leaveBtn);

    const confirmBtn = screen.getByRole("button", { name: "Leave" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Cannot Leave Group",
        description: expect.stringContaining("Cannot leave group while involved in expenses"),
        variant: "destructive"
      }));
    });
  });

  it("opens delete confirmation and triggers mutation", async () => {
    render(<Groups />);
    const group1Card = screen.getByText("Trip to Paris").closest('.rounded-lg');
    const deleteBtn = group1Card!.querySelector('button svg.lucide-trash2')!.closest('button')!;
    fireEvent.click(deleteBtn);

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    // UPDATED: Now expects email as the second argument
    expect(googleApi.deleteGroup).toHaveBeenCalledWith("group1", "alice@example.com");

    // Fix ACT warning: Wait for the dialog to disappear (state update)
    await waitFor(() => expect(screen.queryByText("Delete Group")).not.toBeInTheDocument());
  });
});
