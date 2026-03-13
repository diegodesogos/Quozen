import { renderHook } from "@testing-library/react";
import { useAgent } from "../useAgent";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from 'react';

// Mocks
const mockExecuteCommand = vi.fn();
vi.mock("@quozen/core", () => {
    return {
        QuozenAI: vi.fn().mockImplementation(function (this: any) {
            this.executeCommand = mockExecuteCommand;
            return this;
        }),
    };
});

vi.mock("@/hooks/use-settings", () => ({
    useSettings: vi.fn(() => ({
        settings: {
            preferences: { aiProvider: 'cloud' },
            encryptedApiKey: 'test-key'
        }
    })),
}));

vi.mock("../AiFeatureContext", () => ({
    useAiFeature: vi.fn(() => ({
        provider: { id: 'test-provider', mode: 'cloud' }
    })),
}));

vi.mock("../useRagContext", () => ({
    useRagContext: vi.fn(() => ({
        activeGroupId: 'g1'
    })),
}));

vi.mock("@/hooks/use-toast", () => {
    const toast = vi.fn();
    return {
        useToast: () => ({ toast }),
        toast
    };
});

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/storage", () => ({
    quozen: {},
}));

vi.mock("@/lib/tokenStore", () => ({
    getAuthToken: vi.fn(() => 'test-token'),
}));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false },
    },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("useAgent Hook", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should instantiate QuozenAI and call executeCommand", async () => {
        mockExecuteCommand.mockResolvedValue({ success: true, message: 'Success!' });

        const { result } = renderHook(() => useAgent(), { wrapper });

        const response = await result.current.executeCommand("hello");

        expect(mockExecuteCommand).toHaveBeenCalledWith("hello", "g1", "en");
        expect(response.success).toBe(true);
        expect(response.message).toBe('Success!');
    });

    it("should show error toast if no active group", async () => {
        const { useRagContext } = await import("../useRagContext");
        (useRagContext as any).mockReturnValue({ activeGroupId: null });

        const { result } = renderHook(() => useAgent(), { wrapper });
        await result.current.executeCommand("hello");

        const { toast } = await import("@/hooks/use-toast");
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            variant: "destructive"
        }));
    });

    it("should show error toast if provider is not available in context", async () => {
        const { useAiFeature } = await import("../AiFeatureContext");
        (useAiFeature as any).mockReturnValue({ provider: undefined });

        const { result } = renderHook(() => useAgent(), { wrapper });
        await result.current.executeCommand("hello");

        const { toast } = await import("@/hooks/use-toast");
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            variant: "destructive"
        }));
    });
});
