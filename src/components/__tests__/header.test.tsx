import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "../header";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";

// Mock the useAppContext hook
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

// Mock the useAuth hook
vi.mock("@/context/auth-provider", () => ({
  useAuth: vi.fn(),
}));

// Mock useSettings to avoid internal query logic firing
vi.mock("@/hooks/use-settings", () => ({
  useSettings: vi.fn(),
}));

// Mock the TanStack Query hooks
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  };
});

// Mock googleApi
vi.mock("@/lib/drive", () => ({
  googleApi: {
    listGroups: vi.fn(),
    getGroupData: vi.fn(),
    validateQuozenSpreadsheet: vi.fn(),
  },
}));

describe("Header Component", () => {
  const mockGroups = [
    { id: "group-1", name: "Test Group" },
    { id: "group-2", name: "Another Group" },
  ];

  const mockGroupData = {
    members: [
      { userId: "u1" }, { userId: "u2" }
    ]
  };

  const mockUser = {
    email: "test@example.com",
    name: "Test User"
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      token: "mock-token",
      isAuthenticated: true
    });

    // Provide default mock for settings
    (useSettings as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: { groupCache: [], activeGroupId: "group-1" },
      updateSettings: vi.fn(),
    });
  });

  it("calls listGroups with user email", () => {
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ activeGroupId: "group-1" });
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: mockGroups });

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const useQueryMock = useQuery as unknown as ReturnType<typeof vi.fn>;
    expect(useQueryMock).toHaveBeenCalledWith(expect.objectContaining({
        queryKey: ["drive", "groups", "test@example.com"]
    }));
  });

  it("renders the header with group data", () => {
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ activeGroupId: "group-1" });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === "drive" && queryKey[1] === "groups") {
        return { data: mockGroups };
      }
      if (queryKey[0] === "drive" && queryKey[1] === "group") {
        return { data: mockGroupData };
      }
      return { data: undefined };
    });

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByText("Test Group")).toBeInTheDocument();
    expect(screen.getByText("2 people")).toBeInTheDocument();
  });
});
