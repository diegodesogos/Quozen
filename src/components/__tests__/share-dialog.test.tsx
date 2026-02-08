import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ShareDialog from "../share-dialog";
import { useMutation } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";
import en from "@/locales/en/translation.json";

// Mock hooks
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({ toast: mockToast }),
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

// Mock UI components that are hard to test
vi.mock("@/components/ui/switch", () => ({
    Switch: ({ checked, onCheckedChange, disabled }: any) => (
        <button
            data-testid="mock-switch"
            onClick={() => !disabled && onCheckedChange(!checked)}
            aria-checked={checked}
            disabled={disabled}
        >
            Toggle
        </button>
    ),
}));

vi.mock("@/lib/drive", () => ({
    googleApi: {
        setGroupPermissions: vi.fn(),
    },
}));

// Mock navigator.clipboard
const mockWriteText = vi.fn();
Object.assign(navigator, {
    clipboard: {
        writeText: mockWriteText,
    },
});

describe("ShareDialog Component", () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        groupId: "group-123",
        groupName: "Test Trip",
    };

    const mockMutate = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (useMutation as any).mockImplementation((options: any) => ({
            mutate: (data: any) => {
                mockMutate(data);
                if (options?.mutationFn) {
                    options.mutationFn(data).then(() => {
                        if (options.onSuccess) options.onSuccess(data);
                    }).catch((e: any) => {
                        if (options.onError) options.onError(e);
                    });
                }
            },
            isPending: false,
        }));
    });

    it("renders correctly with group name", () => {
        render(<ShareDialog {...defaultProps} />);
        const expectedTitle = en.share.title.replace("{{name}}", "Test Trip");
        expect(screen.getByText(expectedTitle)).toBeInTheDocument();
        expect(screen.getByTestId("mock-switch")).toBeInTheDocument();
    });

    it("toggles permission when switch is clicked", async () => {
        render(<ShareDialog {...defaultProps} />);

        const switchEl = screen.getByTestId("mock-switch");
        fireEvent.click(switchEl);

        await waitFor(() => {
            expect(mockMutate).toHaveBeenCalledWith(true);
            expect(googleApi.setGroupPermissions).toHaveBeenCalledWith("group-123", "public");
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                description: en.share.successPublic
            }));
        });
    });

    it("reverts switch state on API failure", async () => {
        (googleApi.setGroupPermissions as any).mockRejectedValue(new Error("API Failed"));

        render(<ShareDialog {...defaultProps} />);

        const switchEl = screen.getByTestId("mock-switch");

        // Initial State: Unchecked (false)
        expect(switchEl).toHaveAttribute("aria-checked", "false");

        // Click to toggle
        fireEvent.click(switchEl);

        await waitFor(() => {
            expect(mockMutate).toHaveBeenCalledWith(true);
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                description: en.share.updateError
            }));
        });

        // Check reversion
        await waitFor(() => {
            expect(switchEl).toHaveAttribute("aria-checked", "false");
        });
    });

    it("copies link to clipboard", async () => {
        render(<ShareDialog {...defaultProps} />);

        const copyBtn = screen.getByTitle(en.share.copy);
        fireEvent.click(copyBtn);

        expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining("/join/group-123"));
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            description: en.share.copied
        }));
    });
});
