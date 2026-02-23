import { renderHook, waitFor } from "@testing-library/react";
import { useSettings } from "../use-settings";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { quozen } from "@/lib/storage";
import { useAuth } from "@/context/auth-provider";

// Mocks
vi.mock("@/lib/storage", () => ({
  quozen: {
    groups: {
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      updateActiveGroup: vi.fn(),
    }
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
    (quozen.groups.getSettings as any).mockResolvedValue(mockSettings);

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.settings).toEqual(mockSettings));
  });

  it("updates settings successfully and invalidates queries", async () => {
    const mockSettings = { activeGroupId: "123", version: 1 };
    (quozen.groups.getSettings as any).mockResolvedValue(mockSettings);
    (quozen.groups.saveSettings as any).mockResolvedValue(undefined);

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.settings).toEqual(mockSettings));

    const newSettings = { ...mockSettings, activeGroupId: "456" };
    result.current.updateSettings(newSettings as any);

    await waitFor(() => {
      expect(quozen.groups.saveSettings).toHaveBeenCalledWith(newSettings);
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("updateActiveGroup calls the provider atomic method", async () => {
    (quozen.groups.updateActiveGroup as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useSettings(), { wrapper });

    result.current.updateActiveGroup("new-group-id");

    await waitFor(() => {
      expect(quozen.groups.updateActiveGroup).toHaveBeenCalledWith("new-group-id");
    });
  });
});
