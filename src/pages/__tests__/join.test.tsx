import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
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

// Mock Picker
const mockOpenPicker = vi.fn();
vi.mock("@/hooks/use-google-picker", () => ({
    useGooglePicker: ({ onPick }: any) => {
        return { openPicker: () => mockOpenPicker(onPick), isLoaded: true, error: null };
    }
}));

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
        mockOpenPicker.mockImplementation((cb) => cb({ id: "123" })); // Default success
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows welcome screen and calls join API on click", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        render(
            <MemoryRouter initialEntries={["/join/123?name=TestGroup&inviter=Alice"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Verify Welcome Screen
        expect(screen.getByText(en.join.welcomeTitle)).toBeInTheDocument();
        expect(screen.getByText(/Alice.*TestGroup/)).toBeInTheDocument();

        // Click Join
        fireEvent.click(screen.getByText(en.join.joinButton));

        await waitFor(() => expect(mockMutate).toHaveBeenCalled());
    });

    it("handles Access Denied error and shows recovery UI", async () => {
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

        // Click Join to trigger mutation
        fireEvent.click(screen.getByText(en.join.joinButton));

        await waitFor(() => {
            expect(screen.getByText(en.join.accessRequired)).toBeInTheDocument();
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
            // Trigger Join
            fireEvent.click(screen.getByText(en.join.joinButton));

            vi.advanceTimersByTime(1500);
        });

        expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("shows Step 1/Step 2 flow on 404/Access Denied", async () => {
        (useAuth as any).mockReturnValue({ isAuthenticated: true, user: mockUser, isLoading: false });

        // 1. Initial Failure (404)
        (useMutation as any).mockImplementation((options: any) => ({
            mutate: () => {
                const error = new Error("File not found: 123."); // Google API 404 message style
                if (options.onError) options.onError(error);
            },
            isPending: false,
            isSuccess: false,
            isError: true,
            error: new Error("File not found")
        }));

        render(
            <MemoryRouter initialEntries={["/join/123"]}>
                <Routes>
                    <Route path="/join/:id" element={<JoinPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Trigger Join
        fireEvent.click(screen.getByText(en.join.joinButton));

        // 2. Verify Manual Pick UI appears
        await waitFor(async () => {
            // The text is split across elements, so we look for key phrases
            expect(screen.getByText(en.join.step1)).toBeInTheDocument();
            expect(screen.getByText(en.join.step2)).toBeInTheDocument();
        });

        // 3. Verify it is a link with correct href
        const link = screen.getByRole("link", { name: en.join.step1 });
        expect(link).toHaveAttribute("href", "https://docs.google.com/spreadsheets/d/123");

        // 4. Verify Step 2 is disabled initially
        const step2Btn = screen.getByText(en.join.step2).closest('button');
        expect(step2Btn).toBeDisabled();

        // 5. Click Step 1, then Step 2 should enable
        fireEvent.click(link);
        expect(step2Btn).not.toBeDisabled();

        fireEvent.click(screen.getByText(en.join.step2));
        expect(mockOpenPicker).toHaveBeenCalled();
    });
});
