import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AutoSyncProvider, useAutoSync } from "../auto-sync-context";
import { useAppContext } from "../app-context";
import { useQueryClient } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";
import { MemoryRouter, useLocation } from "react-router-dom";

// Mock dependencies
vi.mock("../app-context", () => ({
    useAppContext: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
    useQueryClient: vi.fn(),
}));

vi.mock("@/lib/drive", () => ({
    googleApi: {
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

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        (useAppContext as any).mockReturnValue({ activeGroupId: "group-1" });

        invalidateQueriesMock = vi.fn();
        (useQueryClient as any).mockReturnValue({
            invalidateQueries: invalidateQueriesMock,
        });

        mockUseLocation.mockReturnValue({ pathname: "/dashboard" });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter>
            <AutoSyncProvider>{children}</AutoSyncProvider>
        </MemoryRouter>
    );

    it("polls periodically when on a safe route", async () => {
        (googleApi.getLastModified as any).mockResolvedValue("2023-01-01T12:00:00Z");

        renderHook(() => useAutoSync(), { wrapper });

        // Initial check on mount
        expect(googleApi.getLastModified).toHaveBeenCalledTimes(1);

        // Interval check
        await act(async () => {
            vi.advanceTimersByTime(30000);
        });

        expect(googleApi.getLastModified).toHaveBeenCalledTimes(2);
    });

    it("pauses polling on unsafe routes", async () => {
        mockUseLocation.mockReturnValue({ pathname: "/edit-expense" });
        (googleApi.getLastModified as any).mockResolvedValue("2023-01-01T12:00:00Z");

        renderHook(() => useAutoSync(), { wrapper });

        // Might be called once on mount if the effect runs before location effect settles, 
        // but let's check subsequent intervals

        await act(async () => {
            vi.advanceTimersByTime(35000);
        });

        // Should not have multiple calls
        expect(googleApi.getLastModified).not.toHaveBeenCalledTimes(2);
    });

    it("resumes polling immediately when returning to safe route", async () => {
        // Start on Unsafe Route
        mockUseLocation.mockReturnValue({ pathname: "/edit-expense" });
        const { result, rerender } = renderHook(() => useAutoSync(), { wrapper });

        expect(result.current.isPaused).toBe(true);
        (googleApi.getLastModified as any).mockClear();

        // Switch to Safe Route
        mockUseLocation.mockReturnValue({ pathname: "/dashboard" });
        rerender();

        expect(result.current.isPaused).toBe(false);

        // Should call immediately (within effect cycle)
        await act(async () => { vi.advanceTimersByTime(100); });

        expect(googleApi.getLastModified).toHaveBeenCalled();
    });
});
