import { useAppContext } from "@/context/app-context";
import { useQuery } from "@tanstack/react-query";
import { quozen } from "@/lib/storage";
import { useAuth } from "@/context/auth-provider";

export const useRagContext = () => {
    const { activeGroupId } = useAppContext();
    const { user: me } = useAuth();

    const { data: ledger } = useQuery({
        queryKey: ["drive", "group", activeGroupId],
        queryFn: () => quozen.ledger(activeGroupId!).getLedger(),
        enabled: !!activeGroupId,
    });

    const buildSystemPrompt = () => {
        if (!ledger || !me) return "";

        const membersList = ledger.members.map(m =>
            `- ${m.name} (id: ${m.userId}${m.userId === me.id ? ', this is YOU' : ''})`
        ).join('\n');

        const balances = ledger.getBalances();
        const balancesList = Object.entries(balances).map(([userId, amount]) => {
            const m = ledger.members.find(member => member.userId === userId);
            const name = m ? m.name : userId;
            const balanceAmount = amount as number;
            return `- ${name}: ${balanceAmount > 0 ? 'is owed' : 'owes'} ${Math.abs(balanceAmount)}`;
        }).join('\n');

        return `You are Quozen AI, an assistant for a decentralized expense sharing app.
Your goal is to help users manage their ledger via natural language.
Current context:
Active Group ID: ${activeGroupId}
Current User (Me): ${me.name} (id: ${me.id})

Members in this group:
${membersList}

Current Balances:
${balancesList}

Today's Date: ${new Date().toDateString()}

When a user asks to split something, you must decide which tool to call and with what arguments.
If a user mentions "me", use id: ${me.id}.
If a user mentions a name, find the corresponding ID from the members list.
Be precise with amounts and member IDs.`;
    };

    return {
        systemPrompt: buildSystemPrompt(),
        ledger,
        activeGroupId,
        isLoading: !ledger
    };
};
