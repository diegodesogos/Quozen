import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AutoSyncProvider } from "@/context/auto-sync-context";
import { useAutoSync } from "@/hooks/use-auto-sync";
import { useAppContext } from "@/context/app-context";
import { useQueryClient } from "@tanstack/react-query";
import { quozen } from "@/lib/storage";
import { MemoryRouter, useLocation } from "react-router-dom";

// Mock dependencies using aliases
vi.mock("@/context/app-context", () => ({
    useAppContext: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
    useQueryClient: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
    quozen: {
        getLastModified: vi.fn(),
    },
}));

// Mock useLocation
const mockUseLocation = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-router-dom")>();
    return {
        ...actual,
        useLocation: () => mockUseLocation(),
    };
});

describe("AutoSyncContext", () => {
    let invalidateQueriesMock: any;
    let stableQueryClient: any;

    // We use a specific test constant (10s) to decouple from environment variables
    const TEST_INTERVAL_SEC = 10;
    const TEST_INTERVAL_MS = TEST_INTERVAL_SEC * 1000;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        (useAppContext as any).mockReturnValue({ activeGroupId: "group-1" });

        invalidateQueriesMock = vi.fn();

        // CRITICAL FIX: Return a stable object reference to prevent useEffect re-runs
        stableQueryClient = {
            invalidateQueries: invalidateQueriesMock,
        };
        (useQueryClient as any).mockReturnValue(stableQueryClient);

        mockUseLocation.mockReturnValue({ pathname: "/dashboard" });
        (quozen.getLastModified as any).mockResolvedValue("2023-01-01T12:00:00Z");
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Wrapper injects the specific test interval
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter>
            <AutoSyncProvider pollingInterval={TEST_INTERVAL_SEC}>{children}</AutoSyncProvider>
        </MemoryRouter>
    );

    it("polls periodically when on a safe route", async () => {
        renderHook(() => useAutoSync(), { wrapper });

        // Initial check on mount (Immediate Sync)
        expect(quozen.getLastModified).toHaveBeenCalledTimes(1);

        // Clear mock to test interval specifically
        (quozen.getLastModified as any).mockClear();

        // Advance by test interval (10s)
        await act(async () => {
            vi.advanceTimersByTime(TEST_INTERVAL_MS);
        });

        // Check if called exactly once
        try {
            expect(quozen.getLastModified).toHaveBeenCalledTimes(1);
        } catch (e: any) {
            throw new Error(`Test failed: Auto-sync did not fire exactly once in ${TEST_INTERVAL_SEC} seconds. 
            Original error: ${e.message}`);
        }
    });

    it("pauses polling on unsafe routes", async () => {
        mockUseLocation.mockReturnValue({ pathname: "/edit-expense" });

        renderHook(() => useAutoSync(), { wrapper });

        // Clear initial calls
        (quozen.getLastModified as any).mockClear();

        // Advance time significantly past the interval
        await act(async () => {
            vi.advanceTimersByTime(TEST_INTERVAL_MS + 5000);
        });

        // Should NOT be called because route is unsafe
        expect(quozen.getLastModified).not.toHaveBeenCalled();
    });

    it("resumes polling immediately when returning to safe route", async () => {
        // Start on Unsafe Route
        mockUseLocation.mockReturnValue({ pathname: "/edit-expense" });
        const { result, rerender } = renderHook(() => useAutoSync(), { wrapper });

        expect(result.current.isPaused).toBe(true);
        (quozen.getLastModified as any).mockClear();

        // Switch to Safe Route
        mockUseLocation.mockReturnValue({ pathname: "/dashboard" });
        rerender();

        expect(result.current.isPaused).toBe(false);

        // Should call immediately (within effect cycle) upon unpausing
        await act(async () => {
            vi.advanceTimersByTime(100);
        });

        expect(quozen.getLastModified).toHaveBeenCalled();
    });
});
