import { renderHook } from "@testing-library/react";
import { useAgent } from "../useAgent";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from 'react';

// Mocks
vi.mock("@/hooks/use-settings", () => ({
    useSettings: vi.fn(() => ({
        settings: {
            preferences: { aiProvider: 'cloud' },
            encryptedApiKey: 'test-key'
        }
    })),
}));

vi.mock("../useRagContext", () => ({
    useRagContext: vi.fn(() => ({
        systemPrompt: 'System Prompt',
        ledger: {},
        activeGroupId: 'g1'
    })),
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/storage", () => ({
    quozen: {
        ledger: vi.fn(() => ({
            addExpense: vi.fn().mockResolvedValue({}),
            addSettlement: vi.fn().mockResolvedValue({}),
        })),
    },
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
    <QueryClientProvider client= { queryClient } > { children } </QueryClientProvider>
);

describe("useAgent Hook", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it("executeCommand calls proxy when provider is cloud", async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ type: 'text', content: 'AI Response' })
        });

        const { result } = renderHook(() => useAgent(), { wrapper });

        const response = await result.current.executeCommand("hello");

        expect(global.fetch).toHaveBeenCalled();
        expect(response.success).toBe(false); // Success is false for text response as per current implementation
        expect(response.message).toBe('AI Response');
    });

    it("handleToolCall adds expense when AI returns tool_call", async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                type: 'tool_call',
                tool: 'addExpense',
                arguments: { description: 'lunch', amount: 50 }
            })
        });

        const { result } = renderHook(() => useAgent(), { wrapper });

        const response = await result.current.executeCommand("I paid 50 for lunch");

        expect(response.success).toBe(true);
    });
});
