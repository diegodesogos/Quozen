import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Profile from "../profile";
import { useAuth } from "@/context/auth-provider";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";

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

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({ 
      mutate: vi.fn(), 
      isPending: false 
    })),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
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
    reconcileGroups: vi.fn(),
  },
}));

describe("Profile Page", () => {
  const mockUser = {
    id: "user1",
    name: "Alice Smith",
    email: "alice@example.com",
    username: "alicesmith",
    picture: "http://example.com/pic.jpg"
  };

  const mockGroups = [
    { id: "group1", name: "Trip 1" },
    { id: "group2", name: "Trip 2" },
    { id: "group3", name: "Trip 3" },
  ];

  const mockLogout = vi.fn();
  const mockUpdateSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Auth Provider to return user
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      logout: mockLogout,
    });

    // Mock Settings
    (useSettings as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: { 
        preferences: { defaultCurrency: "USD" },
        groupCache: [] 
      },
      updateSettings: mockUpdateSettings,
    });

    // Mock Drive Query
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      if (Array.isArray(queryKey) && queryKey[0] === "drive" && queryKey[1] === "groups") {
        return { data: mockGroups };
      }
      return { data: undefined };
    });
  });

  it("renders user profile information", () => {
    render(<Profile />);
    
    expect(screen.getByTestId("text-user-name")).toHaveTextContent("Alice Smith");
    expect(screen.getByTestId("text-user-email")).toHaveTextContent("alice@example.com");
  });

  it("displays correct statistics", () => {
    render(<Profile />);
    
    // We mocked 3 groups
    expect(screen.getByTestId("text-group-count")).toHaveTextContent("3");
    expect(screen.getByText("Active Groups")).toBeInTheDocument();
  });

  it("triggers logout when Sign Out is clicked", () => {
    render(<Profile />);
    
    const signOutBtn = screen.getByTestId("button-sign-out");
    fireEvent.click(signOutBtn);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("allows forcing re-login (troubleshooting)", () => {
    // Mock window.location.reload
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });

    render(<Profile />);
    
    const forceLoginBtn = screen.getByText("Force Re-login");
    fireEvent.click(forceLoginBtn);

    expect(window.location.reload).toHaveBeenCalled();
    
    // Cleanup
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });
});
