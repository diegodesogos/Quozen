import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "../header";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Mock the useAppContext hook
vi.mock("@/context/app-context", () => ({
  useAppContext: vi.fn(),
}));

// Mock the useAuth hook (Required by GroupSwitcherModal -> useGooglePicker)
vi.mock("@/context/auth-provider", () => ({
  useAuth: vi.fn(),
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

    // Default mock for useAuth
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockUser,
      token: "mock-token",
      isAuthenticated: true
    });
  });

  it("renders the header with loading state/default text when no group selected", () => {
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ activeGroupId: null });
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByText("Select Group")).toBeInTheDocument();
  });

  it("renders the header with group data", () => {
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ activeGroupId: "group-1" });

    // Mock implementations for multiple queries
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
    // 2 members in mockGroupData
    expect(screen.getByText("2 people")).toBeInTheDocument();
  });

  it("opens the group switcher modal when the button is clicked", async () => {
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ activeGroupId: "group-1" });

    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === "drive" && queryKey[1] === "groups") {
        return { data: mockGroups };
      }
      return { data: undefined };
    });

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const button = screen.getByTestId("button-switch-group");
    fireEvent.click(button);

    expect(screen.getByTestId("modal-group-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("button-select-group-group-1")).toBeInTheDocument();
    expect(screen.getByTestId("button-select-group-group-2")).toBeInTheDocument();
  });
});
