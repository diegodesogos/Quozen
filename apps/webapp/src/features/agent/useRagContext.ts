import { useAppContext } from "@/context/app-context";
import { useQuery } from "@tanstack/react-query";
import { quozen } from "@/lib/storage";
import { useAuth } from "@/context/auth-provider";
import { AgentOrchestrator } from "@quozen/core";

export const useRagContext = () => {
    const { activeGroupId } = useAppContext();
    const { user: me } = useAuth();

    const { data: ledger } = useQuery({
        queryKey: ["drive", "group", activeGroupId],
        queryFn: () => quozen.ledger(activeGroupId!).getLedger(),
        enabled: !!activeGroupId,
    });

    const systemPrompt = (ledger && me && activeGroupId)
        ? AgentOrchestrator.buildSystemPrompt({ ledger, me, activeGroupId })
        : "";

    return {
        systemPrompt,
        ledger,
        activeGroupId,
        isLoading: !ledger
    };
};
