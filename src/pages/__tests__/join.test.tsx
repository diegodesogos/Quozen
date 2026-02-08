import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import JoinPage from "../join";
import { useAuth } from "@/context/auth-provider";
import { useAppContext } from "@/context/app-context";
import { useMutation } from "@tanstack/react-query";
import en from "@/locales/en/translation.json";

// Hoist mocks
const { mockNavigate } = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
}));

// Mock hooks
vi.mock("@/context/auth-provider", () => ({
    useAuth: vi.fn(),
}));

vi.mock("@/context/app-context", () => ({
    useAppContext: vi.fn(),
}));

const mockMutate = vi.fn();
vi.mock("@tanstack/react-query", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@tanstack/react-query")>();
    return {
        ...actual,
        useMutation: vi.fn(() => ({
            mutate: mockMutate,
            isPending: false,
            isSuccess: false,
            isError: false,
            error: null
        })),
        useQueryClient: vi.fn(() => ({
            invalidateQueries: vi.fn(),
        })),
    };
});

vi.mock("@/lib/drive", () => ({
    googleApi: {
        joinGroup: vi.fn(),
    },
}));

// Mock router
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe("JoinPage", () => {
    const mockSetActiveGroup = vi.fn();
    const mockUser = { id: "u1", email: "test@example.com" };

    beforeEach(() => {
        vi.clearAllMocks();
        // Use Real Timers by default to avoid waitFor timeouts
        vi.useRealTimers();
        (useAppContext as any).mockReturnValue({ setActiveGroupId: mockSetActiveGroup });

        // Reset default mutation behavior
        (useMutation as any).mockReturnValue({
            mutate: mockMutate,
            isPending: false,
            isSuccess: false,
            isError: false
        });
    });

    it("redirects to login if not authenticated", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: false, isLoading: false });

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/login", expect.objectContaining({
                state: expect.objectContaining({
                    message: en.join.signIn
                })
            }));
        });
    });

    it("calls join API if authenticated", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(mockMutate).toHaveBeenCalled());
    });

    it("displays error state on failure", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        // Override mutation
        (useMutation as any).mockImplementation((options: any) => ({
            mutate: () => {
                // Simulate async error
                setTimeout(() => {
                    act(() => {
                        options.onError(new Error("Permission denied"));
                    });
                }, 10);
            },
            // Fix: isPending must be false initially for useEffect to call mutate()
            isPending: false,
            isSuccess: false
        }));

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Wait for error text
        await waitFor(() => {
            expect(screen.getByText(en.join.errorTitle)).toBeInTheDocument();
        });
    });

    it("redirects to dashboard on success after delay", async () => {
        // Enable fake timers JUST for this test
        vi.useFakeTimers();

        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        (useMutation as any).mockImplementation((options: any) => ({
            mutate: () => {
                // Trigger success
                options.onSuccess({ id: "123", name: "New Group" });
            },
            isPending: false, // Initially false so effect runs
            isSuccess: false
        }));

        const { rerender } = render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Update mock to reflect success state (simulating re-render after state update)
        // Note: In a real integration test with a real query client provider this happens automatically,
        // but here we are mocking the hook return value directly.
        (useMutation as any).mockReturnValue({
            mutate: mockMutate,
            isPending: false,
            isSuccess: true
        });
        rerender(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Advance timer for the setTimeout(..., 1000)
        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");

        vi.useRealTimers();
    });
});
