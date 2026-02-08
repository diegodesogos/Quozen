import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import JoinPage from "../join";
import { useAuth } from "@/context/auth-provider";
import { useAppContext } from "@/context/app-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";
import en from "@/locales/en/translation.json";

// Mocks
vi.mock("@/context/auth-provider", () => ({
    useAuth: vi.fn(),
}));

vi.mock("@/context/app-context", () => ({
    useAppContext: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@tanstack/react-query")>();
    return {
        ...actual,
        useMutation: vi.fn(),
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

const mockNavigate = vi.fn();
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
        (useAppContext as any).mockReturnValue({ setActiveGroupId: mockSetActiveGroup });
    });

    it("redirects to login if not authenticated", () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: false, isLoading: false });

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(mockNavigate).toHaveBeenCalledWith("/login", expect.anything());
    });

    it("calls join API if authenticated", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });
        const mockMutate = vi.fn();

        (useMutation as any).mockReturnValue({
            mutate: mockMutate,
            isPending: false,
            isSuccess: false
        });

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(mockMutate).toHaveBeenCalled();
    });

    it("displays error state on failure", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        (useMutation as any).mockImplementation((options: any) => ({
            mutate: () => {
                options.onError(new Error("Permission denied"));
            },
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

        await waitFor(() => {
            expect(screen.getByText(en.join.errorTitle)).toBeInTheDocument();
        });
    });

    it("redirects to dashboard on success", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        (useMutation as any).mockImplementation((options: any) => ({
            mutate: () => {
                // Trigger success
                options.onSuccess({ id: "123", name: "New Group" });
            },
            isPending: false,
            isSuccess: true
        }));

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText(en.join.successTitle)).toBeInTheDocument());

        // Wait for the timeout to pass
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
        }, { timeout: 2500 });
    });
});
