import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Profile from "../profile";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { useQuery } from "@tanstack/react-query";

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
  };
});

describe("Profile Page", () => {
  const mockUser = {
    id: "user1",
    name: "Alice Smith",
    email: "alice@example.com",
    username: "alicesmith",
  };

  const mockGroups = [
    { id: "group1", name: "Trip 1" },
    { id: "group2", name: "Trip 2" },
    { id: "group3", name: "Trip 3" },
  ];

  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentUserId: "user1",
    });

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      logout: mockLogout,
    });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      const key = queryKey[0];
      
      // User Profile Data: queryKey = ["/api/users", "user1"] (Length 2)
      if (key === "/api/users" && queryKey[1] === "user1" && queryKey.length === 2) {
        return { data: mockUser };
      }
      
      // User Groups Data: queryKey = ["/api/users", "user1", "groups"] (Length 3)
      if (key === "/api/users" && queryKey[1] === "user1" && queryKey[2] === "groups") {
        return { data: mockGroups };
      }
      
      return { data: undefined };
    });
  });

  it("renders user profile information", () => {
    render(<Profile />);
    
    expect(screen.getByTestId("text-user-name")).toHaveTextContent("Alice Smith");
    expect(screen.getByTestId("text-user-email")).toHaveTextContent("alice@example.com");
    expect(screen.getByTestId("text-username")).toHaveTextContent("@alicesmith");
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
});
