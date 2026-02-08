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
        vi.useRealTimers();
        (useAppContext as any).mockReturnValue({ setActiveGroupId: mockSetActiveGroup });

        (useMutation as any).mockReturnValue({
            mutate: mockMutate,
            isPending: false,
            isSuccess: false,
            isError: false
        });
    });

    afterEach(() => {
        vi.useRealTimers();
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

    it("handles Access Denied error from mutation", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        // Simulate Access Denied error in mutation
        (useMutation as any).mockImplementation((options: any) => ({
            mutate: () => {
                const error = new Error("403 Forbidden");
                if (options.onError) options.onError(error);
            },
            isPending: false,
            isSuccess: false,
            isError: true,
            error: new Error("403 Forbidden")
        }));

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(en.join.accessDenied)).toBeInTheDocument();
        });
    });

    it("handles Stuck state (Already Member) by treating it as success and redirecting", async () => {
        vi.useFakeTimers();

        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        // Setup mock: isSuccess MUST be false initially so useEffect calls mutate
        (useMutation as any).mockImplementation((options: any) => ({
            mutate: () => {
                // Call success immediately
                if (options.onSuccess) options.onSuccess({ id: "123", name: "Existing Group" });
            },
            isPending: false,
            isSuccess: false, // Important: must be false to trigger the effect
            data: null
        }));

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Advance timers to trigger the setTimeout in onSuccess
        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
});
