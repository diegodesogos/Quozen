import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../login";
import { useAuth } from "@/context/auth-provider";

// Mock the auth provider hook
vi.mock("@/context/auth-provider", () => ({
  useAuth: vi.fn(),
}));

// Mock router navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    // Explicitly mock Navigate to trigger our spy when rendered
    Navigate: ({ to, replace }: { to: string, replace?: boolean }) => {
      mockNavigate(to, { replace });
      return null;
    }
  };
});

describe("Login Page", () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it("renders google login button", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByText("Welcome to Quozen")).toBeInTheDocument();
    expect(screen.getByText(/Sign in to access your shared expenses/i)).toBeInTheDocument();
    // Check for the Google button
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    
    // Ensure old fields are gone
    expect(screen.queryByPlaceholderText("Username")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
  });

  it("triggers login on button click", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const loginBtn = screen.getByRole("button", { name: /sign in with google/i });
    fireEvent.click(loginBtn);

    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it("redirects if already authenticated", () => {
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      login: mockLogin,
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    // Should redirect to dashboard (default)
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });
});
