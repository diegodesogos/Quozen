import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "../header";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";
import { useGroups } from "@/hooks/use-groups";
import en from "@/locales/en/translation.json";

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
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  };
});

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
    (useSettings as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: {
        groupCache: [
          { id: "group-1", name: "Test Group", role: "owner" },
          { id: "group-2", name: "Another Group", role: "member" }
        ],
        activeGroupId: "group-1"
      },
      updateSettings: vi.fn(),
    });
    (useGroups as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      groups: mockGroups,
      isLoading: false
    });
  });

  it("renders the header with group data", () => {
    (useAppContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ activeGroupId: "group-1" });
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === "drive" && queryKey[1] === "group" && queryKey[2] === "group-1") {
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

    // Check for "2 people" interpolation
    const expectedPeopleText = en.header.people_other.replace("{{count}}", "2");
    expect(screen.getByText(expectedPeopleText)).toBeInTheDocument();
  });
});
