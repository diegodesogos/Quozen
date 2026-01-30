import { renderHook, waitFor } from "@testing-library/react";
import { useSettings } from "../use-settings";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";
import { useAuth } from "@/context/auth-provider";

// Mocks
vi.mock("@/lib/drive", () => ({
  googleApi: {
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
  },
}));

vi.mock("@/context/auth-provider", () => ({
  useAuth: vi.fn(),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("useSettings Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: { email: "test@example.com" } });
  });

  it("fetches settings successfully", async () => {
    const mockSettings = { activeGroupId: "123", version: 1 };
    (googleApi.getSettings as any).mockResolvedValue(mockSettings);

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.settings).toEqual(mockSettings));
  });

  it("updates settings successfully and invalidates queries", async () => {
    const mockSettings = { activeGroupId: "123", version: 1 };
    (googleApi.getSettings as any).mockResolvedValue(mockSettings);
    (googleApi.saveSettings as any).mockResolvedValue(undefined);

    // Spy on queryClient.invalidateQueries
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.settings).toEqual(mockSettings));

    const newSettings = { ...mockSettings, activeGroupId: "456" };
    result.current.updateSettings(newSettings as any);

    await waitFor(() => {
      expect(googleApi.saveSettings).toHaveBeenCalledWith(newSettings);
    });
    
    // Verify invalidation happened
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
