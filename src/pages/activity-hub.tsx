import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { googleApi } from "@/lib/drive";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowRight, Handshake, Filter, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import SettlementModal from "@/components/settlement-modal";
import ExpensesList from "./expenses";
import { Member, Settlement, Expense } from "@/lib/storage/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

type SortOption = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export default function ActivityHub() {
    const { activeGroupId, currentUserId } = useAppContext();
    const [activeTab, setActiveTab] = useState("expenses");

    // Expenses State
    const [sortOption, setSortOption] = useState<SortOption>("date_desc");
    const [filterMyExpenses, setFilterMyExpenses] = useState(false); // true = Show Me Only, false = Show All

    // Settlements Tab State
    const [sortTransfersOption, setSortTransfersOption] = useState<SortOption>("date_desc");
    const [showAllSettlements, setShowAllSettlements] = useState(false); // false = Show Me Only
    const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);

    // Fetch Data
    const { data: groupData, isLoading } = useQuery({
        queryKey: ["drive", "group", activeGroupId],
        queryFn: () => googleApi.getGroupData(activeGroupId),
        enabled: !!activeGroupId,
    });

    const settlements = (groupData?.settlements || []) as Settlement[];
    const expenses = (groupData?.expenses || []) as Expense[];
    const members = (groupData?.members || []) as Member[];

    // -------------------------
    // Process Expenses
    // -------------------------
    const filteredExpenses = useMemo(() => {
        let result = [...expenses];

        // Filter
        if (filterMyExpenses) {
            result = result.filter(e =>
                e.paidBy === currentUserId ||
                e.splits?.some((s: any) => s.userId === currentUserId && s.amount > 0)
            );
        }

        // Sort
        result.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            const amountA = Number(a.amount);
            const amountB = Number(b.amount);

            switch (sortOption) {
                case "date_asc": return dateA - dateB;
                case "date_desc": return dateB - dateA;
                case "amount_asc": return amountA - amountB;
                case "amount_desc": return amountB - amountA;
                default: return 0;
            }
        });

        return result;
    }, [expenses, sortOption, filterMyExpenses, currentUserId]);

    // -------------------------
    // Process Settlements
    // -------------------------
    const filteredSettlements = useMemo(() => {
        let result = [...settlements];

        // Filter
        if (!showAllSettlements) {
            result = result.filter(s => s.fromUserId === currentUserId || s.toUserId === currentUserId);
        }

        // Sort
        result.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            const amountA = Number(a.amount);
            const amountB = Number(b.amount);

            switch (sortTransfersOption) {
                case "date_asc": return dateA - dateB;
                case "date_desc": return dateB - dateA;
                case "amount_asc": return amountA - amountB;
                case "amount_desc": return amountB - amountA;
                default: return 0;
            }
        });

        return result;
    }, [settlements, showAllSettlements, sortTransfersOption, currentUserId]);

    const getMember = (id: string) => members.find(m => m.userId === id) || { name: "Unknown", userId: id } as Member;

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Sticky Tabs Header */}
            <div className="sticky top-[57px] z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border shadow-sm pt-2 pb-2 px-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="expenses">Expenses</TabsTrigger>
                        <TabsTrigger value="transfers">Transfers</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="mt-2">
                {activeTab === 'expenses' ? (
                    <div className="flex flex-col">
                        {/* Sub-header for Expenses */}
                        <div className="px-4 py-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                {!filterMyExpenses ? "All Expenses" : "My Expenses"}
                            </h3>
                            <div className="flex items-center gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted text-muted-foreground">
                                            <ArrowUpDown className={cn("w-4 h-4 transition-colors", sortOption !== 'date_desc' && "text-primary")} />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setSortOption("date_desc")}>
                                            Date (Newest)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSortOption("date_asc")}>
                                            Date (Oldest)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSortOption("amount_desc")}>
                                            Amount (High to Low)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSortOption("amount_asc")}>
                                            Amount (Low to High)
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Me/All Toggle */}
                                <div className="flex items-center space-x-2 bg-muted/50 p-1 rounded-full border border-border">
                                    <span
                                        className={cn("text-[10px] px-2 cursor-pointer transition-colors", filterMyExpenses ? "font-bold text-primary" : "text-muted-foreground")}
                                        onClick={() => setFilterMyExpenses(true)}
                                    >
                                        Me
                                    </span>
                                    <Switch
                                        id="expenses-mode-switch"
                                        className="scale-75"
                                        checked={!filterMyExpenses}
                                        onCheckedChange={(checked) => setFilterMyExpenses(!checked)}
                                    />
                                    <span
                                        className={cn("text-[10px] px-2 cursor-pointer transition-colors", !filterMyExpenses ? "font-bold text-primary" : "text-muted-foreground")}
                                        onClick={() => setFilterMyExpenses(false)}
                                    >
                                        All
                                    </span>
                                </div>
                            </div>
                        </div>

                        <ExpensesList
                            expenses={filteredExpenses}
                            members={members}
                            isLoading={isLoading}
                        />
                    </div>
                ) : (
                    <div className="px-4">
                        <div className="flex items-center justify-between py-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                {showAllSettlements ? "All Transfers" : "My Transfers"}
                            </h3>

                            <div className="flex items-center gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted text-muted-foreground">
                                            <ArrowUpDown className={cn("w-4 h-4 transition-colors", sortTransfersOption !== 'date_desc' && "text-primary")} />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setSortTransfersOption("date_desc")}>
                                            Date (Newest)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSortTransfersOption("date_asc")}>
                                            Date (Oldest)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSortTransfersOption("amount_desc")}>
                                            Amount (High to Low)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setSortTransfersOption("amount_asc")}>
                                            Amount (Low to High)
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <div className="flex items-center space-x-2 bg-muted/50 p-1 rounded-full border border-border">
                                    <span className={cn("text-[10px] px-2 cursor-pointer transition-colors", !showAllSettlements ? "font-bold text-primary" : "text-muted-foreground")} onClick={() => setShowAllSettlements(false)}>Me</span>
                                    <Switch
                                        id="transfers-mode-switch"
                                        className="scale-75"
                                        checked={showAllSettlements}
                                        onCheckedChange={setShowAllSettlements}
                                    />
                                    <span className={cn("text-[10px] px-2 cursor-pointer transition-colors", showAllSettlements ? "font-bold text-primary" : "text-muted-foreground")} onClick={() => setShowAllSettlements(true)}>All</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pb-4">
                            {filteredSettlements.length === 0 ? (
                                <div className="text-center py-12 opacity-50">
                                    <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Handshake className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm font-medium">No transfers found</p>
                                </div>
                            ) : (
                                filteredSettlements.map((settlement) => {
                                    const from = getMember(settlement.fromUserId);
                                    const to = getMember(settlement.toUserId);
                                    const isMeSender = settlement.fromUserId === currentUserId;
                                    const isMeReceiver = settlement.toUserId === currentUserId;
                                    const isNeutral = !isMeSender && !isMeReceiver;

                                    let statusColor = "text-muted-foreground";
                                    if (isMeSender) statusColor = "text-orange-600 dark:text-orange-400";
                                    if (isMeReceiver) statusColor = "text-green-600 dark:text-green-400";

                                    return (
                                        <Card
                                            key={settlement.id}
                                            className={cn("cursor-pointer transition-all hover:shadow-md border-l-4",
                                                isNeutral ? "opacity-80 bg-muted/10 border-l-muted" :
                                                    isMeSender ? "border-l-orange-500" : "border-l-green-500"
                                            )}
                                            onClick={() => setEditingSettlement(settlement)}
                                        >
                                            <CardContent className="flex items-center justify-between p-4 py-3">
                                                {/* Sender */}
                                                <div className="flex flex-col items-center gap-1 w-14 shrink-0">
                                                    <Avatar className="w-8 h-8 border-2 border-background shadow-sm">
                                                        <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">{from.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-[10px] truncate max-w-full font-medium text-muted-foreground">
                                                        {isMeSender ? "You" : from.name.split(' ')[0]}
                                                    </span>
                                                </div>

                                                {/* Flow */}
                                                <div className="flex flex-col items-center justify-center flex-1 px-2 relative">
                                                    {/* Connecting Line with Arrow */}
                                                    <div className="absolute top-1/2 left-0 w-full transform -translate-y-1/2 px-1">
                                                        <div className="w-full h-[1px] bg-border relative">
                                                            <div className="absolute -right-[1px] top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 border-border rotate-45 bg-background" />
                                                        </div>
                                                    </div>

                                                    <div className={cn("relative z-10 text-base font-bold bg-card px-3 rounded-full", statusColor)}>
                                                        ${settlement.amount.toFixed(2)}
                                                    </div>
                                                    <span className="text-[9px] text-muted-foreground mt-1 relative z-10 bg-card px-1">
                                                        {format(new Date(settlement.date), "MMM d")}
                                                    </span>
                                                </div>

                                                {/* Receiver */}
                                                <div className="flex flex-col items-center gap-1 w-14 shrink-0">
                                                    <Avatar className="w-8 h-8 border-2 border-background shadow-sm">
                                                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{to.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-[10px] truncate max-w-full font-medium text-muted-foreground">
                                                        {isMeReceiver ? "You" : to.name.split(' ')[0]}
                                                    </span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {editingSettlement && (
                <SettlementModal
                    isOpen={!!editingSettlement}
                    onClose={() => setEditingSettlement(null)}
                    initialData={editingSettlement}
                    users={members}
                />
            )}
        </div>
    );
}
