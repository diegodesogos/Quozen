import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Groups from "../groups";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { useQuery, useMutation } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";

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
      { userId: "user1", role: "admin", name: "Alice", email: "alice@example.com" },
      { userId: "user2", role: "member", name: "Bob", email: "bob@example.com" }
    ]
  };

  const mutateCreateGroup = vi.fn();
  const mutateUpdateGroup = vi.fn();
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

    // Mock mutations to call their functions immediately (simulate immediate execution for logic testing)
    (useMutation as unknown as ReturnType<typeof vi.fn>).mockImplementation((options) => {
      return {
        mutate: async (data: any) => {
            try {
                if (options?.mutationFn) await options.mutationFn(data);
                if (options?.onSuccess) options.onSuccess(data);
            } catch(e: any) {
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

  // Story 2.2: Test validation preventing removal of member with expenses
  it("prevents removing a member with existing expenses during edit", async () => {
    // 1. Mock getGroupData to return current members
    (googleApi.getGroupData as any).mockResolvedValue(mockGroup1Data);
    
    // 2. Mock checkMemberHasExpenses to return true for user2
    (googleApi.checkMemberHasExpenses as any).mockResolvedValue(true);

    render(<Groups />);

    // 3. Click Edit on Group 1
    const group1Card = screen.getByText("Trip to Paris").closest('.rounded-lg');
    const editBtn = group1Card!.querySelector('button svg.lucide-pencil')!.closest('button')!;
    fireEvent.click(editBtn);

    // Wait for dialog
    await waitFor(() => expect(screen.getByText("Edit Group")).toBeInTheDocument());

    // 4. Change members input (Remove user2/Bob)
    const membersInput = screen.getByLabelText("Members (Optional)");
    fireEvent.change(membersInput, { target: { value: "" } }); // Clear members, removing Bob

    // 5. Submit
    const saveBtn = screen.getByRole("button", { name: "Update Group" });
    fireEvent.click(saveBtn);

    // 6. Verify error toast was called
    await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: "Update Failed",
            description: expect.stringContaining("Cannot remove Bob because they have recorded expenses"),
            variant: "destructive"
        }));
    });

    // 7. Verify API update was NOT called
    expect(googleApi.updateGroup).not.toHaveBeenCalled();
  });

  // Story 2.5: Test validation preventing leaving group with expenses
  it("prevents leaving a group if user has expenses", async () => {
    // Mock leaveGroup API to throw error (mimicking backend/provider logic)
    (googleApi.leaveGroup as any).mockRejectedValue(new Error("Cannot leave group while involved in expenses."));

    render(<Groups />);

    // Click Leave on Group 2
    const group2Card = screen.getByText("Office Lunch").closest('.rounded-lg');
    const leaveBtn = group2Card!.querySelector('button svg.lucide-log-out')!.closest('button')!;
    fireEvent.click(leaveBtn);

    // Confirm
    const confirmBtn = screen.getByRole("button", { name: "Leave" });
    fireEvent.click(confirmBtn);

    // Verify error toast
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

    expect(googleApi.deleteGroup).toHaveBeenCalledWith("group1");
  });
});
