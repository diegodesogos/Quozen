import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../login";
import { useAuth } from "@/context/auth-provider";
import en from "@/locales/en/translation.json";

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

    expect(screen.getByText(en.login.welcome)).toBeInTheDocument();
    expect(screen.getByText(en.login.subtitle)).toBeInTheDocument();

    // The button contains an image with alt="Google" and the text "Continue with Google".
    // RTL computes the accessible name as "Google Continue with Google".
    // We use a regex to be flexible.
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("triggers login on button click", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const loginBtn = screen.getByRole("button", { name: /continue with google/i });
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

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });
});
