import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Button } from "@/components/ui/button";
import SettlementModal from "@/components/settlement-modal";
import { useState, useMemo } from "react";
import {
  Utensils, Car, Bed, ShoppingBag, Gamepad2, MoreHorizontal,
  Wallet, Handshake, ChevronDown, ChevronRight, ArrowRight
} from "lucide-react";
import { googleApi } from "@/lib/drive";
import { useNavigate } from "react-router-dom";
import {
  calculateBalances,
  suggestSettlementStrategy,
  calculateTotalSpent,
  getExpenseUserStatus,
  getDirectSettlementDetails
} from "@/lib/finance";
import { Expense, Settlement, Member } from "@/lib/storage/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { formatCurrency } from "@/lib/format-currency";
import { useSettings } from "@/hooks/use-settings";

export default function Dashboard() {
  const { activeGroupId, currentUserId } = useAppContext();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { formatDate } = useDateFormatter();
  const { settings } = useSettings();

  const currencyCode = settings?.preferences?.defaultCurrency || "USD";

  const [settlementModal, setSettlementModal] = useState<{
    isOpen: boolean;
    fromUser?: { userId: string; name: string };
    toUser?: { userId: string; name: string };
    suggestedAmount?: number;
    initialData?: Settlement;
  }>({ isOpen: false });

  const [isBalancesOpen, setIsBalancesOpen] = useState(true);
  const [isActivityOpen, setIsActivityOpen] = useState(true);

  const { data: groupData, isLoading } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId),
    enabled: !!activeGroupId,
  });

  const expenses = (groupData?.expenses || []) as Expense[];
  const settlements = (groupData?.settlements || []) as Settlement[];
  const users = (groupData?.members || []) as Member[];

  const currentUser = users.find(u => u.userId === currentUserId);

  const getUserById = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u ? { userId: u.userId, name: u.name, email: u.email } : undefined;
  };

  const getMemberName = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u ? u.name : "Unknown";
  };

  const balances = useMemo(() => {
    return calculateBalances(users, expenses, settlements);
  }, [expenses, settlements, users]);

  const totalSpent = useMemo(() => {
    return calculateTotalSpent(currentUserId, expenses);
  }, [expenses, currentUserId]);

  const userBalance = balances[currentUserId] || 0;

  const recentActivity = useMemo(() => {
    const combined = [
      ...expenses.map(e => ({ ...e, type: 'expense' as const })),
      ...settlements.map(s => ({ ...s, type: 'settlement' as const }))
    ];

    return combined
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [expenses, settlements]);

  const getExpenseIcon = (category: string) => {
    switch (category?.toLowerCase()) {
      case "food": case "food & dining": return Utensils;
      case "transportation": return Car;
      case "accommodation": return Bed;
      case "shopping": return ShoppingBag;
      case "entertainment": return Gamepad2;
      default: return MoreHorizontal;
    }
  };

  const settlementSuggestion = useMemo(() => {
    if (!users.length) return null;
    return suggestSettlementStrategy(currentUserId, balances, users);
  }, [currentUserId, balances, users]);

  const handleSettleUp = () => {
    if (!currentUser || !settlementSuggestion) return;

    const fromUser = getUserById(settlementSuggestion.fromUserId);
    const toUser = getUserById(settlementSuggestion.toUserId);

    if (fromUser && toUser) {
      setSettlementModal({
        isOpen: true,
        fromUser,
        toUser,
        suggestedAmount: settlementSuggestion.amount,
        initialData: undefined
      });
    }
  };

  const handleSettleWith = (targetUserId: string) => {
    if (!currentUser) return;
    const targetUser = getUserById(targetUserId);
    if (!targetUser) return;

    const smartStrategy = suggestSettlementStrategy(targetUserId, balances, users);
    let settlement;

    if (smartStrategy) {
      settlement = smartStrategy;
    } else {
      const otherBalance = balances[targetUserId] || 0;
      settlement = getDirectSettlementDetails(
        currentUser.userId,
        userBalance,
        targetUserId,
        otherBalance
      );
    }

    const fromUser = getUserById(settlement.fromUserId);
    const toUser = getUserById(settlement.toUserId);

    if (fromUser && toUser) {
      setSettlementModal({
        isOpen: true,
        fromUser,
        toUser,
        suggestedAmount: settlement.amount,
        initialData: undefined
      });
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center">{t("common.loading")}</div>;
  }

  if (!groupData) {
    return <div className="p-4 text-center">{t("dashboard.groupNotFound")}</div>;
  }

  return (
    <>
      <div className="space-y-4" data-testid="dashboard-view">
        <div className="mx-4 mt-4 bg-card rounded-lg border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" /> {t("dashboard.balance")}
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="text-primary hover:text-primary border-primary/20 hover:bg-primary/10"
              onClick={handleSettleUp}
              disabled={!settlementSuggestion}
              data-testid="button-settle-up"
            >
              {t("dashboard.settleUp")}
            </Button>
          </div>
          <div className="text-center py-2">
            <div
              className={`text-4xl font-bold ${userBalance >= 0 ? 'expense-positive' : 'expense-negative'}`}
              data-testid="text-user-balance"
            >
              {userBalance >= 0 ? '+' : ''}{formatCurrency(Math.abs(userBalance), currencyCode, i18n.language)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {userBalance >= 0 ? t("dashboard.owed") : t("dashboard.owe")}
            </p>

            <div className="mt-4 pt-4 border-t border-dashed border-border flex justify-between items-center px-8">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.totalSpent")}</span>
              <span className="font-medium text-foreground">{formatCurrency(totalSpent, currencyCode, i18n.language)}</span>
            </div>
          </div>
        </div>

        <div className="mx-4 bg-card rounded-lg border border-border overflow-hidden">
          <Collapsible open={isBalancesOpen} onOpenChange={setIsBalancesOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between p-4 border-b border-border bg-muted/30 hover:bg-muted/50 transition-colors">
              <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">{t("dashboard.groupBalances")}</h3>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", !isBalancesOpen && "-rotate-90")} />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="divide-y divide-border">
                {users
                  .filter(u => u.userId !== currentUserId)
                  .map((u) => {
                    const balance = balances[u.userId] || 0;

                    return (
                      <div key={u.userId} className="p-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center border border-border">
                            <span className="text-foreground font-medium text-sm">
                              {u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{u.name}</p>
                            {u.role === 'owner' && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                {t("roles.owner")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`font-semibold ${balance >= 0 ? 'expense-positive' : 'expense-negative'}`}
                            data-testid={`text-balance-${u.userId}`}
                          >
                            {balance >= 0 ? '+' : ''}{formatCurrency(Math.abs(balance), currencyCode, i18n.language)}
                          </div>
                          <Button
                            variant="link"
                            size="sm"
                            className="text-xs text-muted-foreground h-auto p-0 hover:text-primary"
                            onClick={() => handleSettleWith(u.userId)}
                            data-testid={`button-settle-with-${u.userId}`}
                          >
                            {t("dashboard.settle")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="mx-4 bg-card rounded-lg border border-border overflow-hidden">
          <Collapsible open={isActivityOpen} onOpenChange={setIsActivityOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between p-4 border-b border-border bg-muted/30 hover:bg-muted/50 transition-colors">
              <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">{t("dashboard.recentActivity")}</h3>
              <div className="flex items-center gap-2">
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", !isActivityOpen && "-rotate-90")} />
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              {isActivityOpen && (
                <div className="divide-y divide-border">
                  {recentActivity.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-muted-foreground text-sm">{t("dashboard.noActivity")}</p>
                      <Button variant="link" onClick={() => navigate('/add-expense')} className="mt-2">{t("dashboard.addFirst")}</Button>
                    </div>
                  ) : (
                    recentActivity.map((item) => {
                      if (item.type === 'settlement') {
                        const s = item as Settlement;
                        const fromName = s.fromUserId === currentUserId ? t("dashboard.you") : getMemberName(s.fromUserId).split(' ')[0];
                        const toName = s.toUserId === currentUserId ? t("dashboard.you") : getMemberName(s.toUserId).split(' ')[0];
                        const isMeSender = s.fromUserId === currentUserId;
                        const isMeReceiver = s.toUserId === currentUserId;

                        let colorClass = "text-muted-foreground";
                        if (isMeSender) colorClass = "text-orange-600 dark:text-orange-400";
                        if (isMeReceiver) colorClass = "text-green-600 dark:text-green-400";

                        return (
                          <div
                            key={s.id}
                            className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => setSettlementModal({ isOpen: true, initialData: s })}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-secondary/50 rounded-full flex items-center justify-center border border-border">
                                  <Handshake className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1 font-medium text-foreground text-sm">
                                    <span>{fromName}</span>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                    <span>{toName}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {t("dashboard.transfer")} • {formatDate(s.date, "MMM d")}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={cn("font-bold text-sm", colorClass)}>
                                  {formatCurrency(Number(s.amount), currencyCode, i18n.language)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const e = item as Expense;
                      const paidByUser = getUserById(e.paidBy);
                      const Icon = getExpenseIcon(e.category);
                      const status = getExpenseUserStatus(e, currentUserId);

                      return (
                        <div key={e.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/edit-expense/${e.id}`)} data-testid={`expense-item-${e.id}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center border border-border">
                                <Icon className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground text-sm">{e.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {paidByUser?.name || 'Unknown'} • {formatDate(e.date, "MMM d")}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-foreground text-sm">{formatCurrency(Number(e.amount), currencyCode, i18n.language)}</div>

                              {status.status === 'payer' && (
                                <div className="text-xs expense-positive">{t("dashboard.paid")}</div>
                              )}
                              {status.status === 'debtor' && (
                                <div className="text-xs expense-negative">{t("dashboard.owe").split(' ')[0]} {formatCurrency(status.amountOwed, currencyCode, i18n.language)}</div>
                              )}
                              {status.status === 'none' && (
                                <div className="text-xs text-muted-foreground">{t("dashboard.notInvolved")}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div className="p-2 text-center bg-muted/10">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-primary h-8 w-full"
                      data-testid="button-view-all-expenses"
                      onClick={() => navigate('/expenses')}
                    >
                      {t("dashboard.viewHistory")}
                    </Button>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <SettlementModal
        isOpen={settlementModal.isOpen}
        onClose={() => setSettlementModal({ isOpen: false })}
        fromUser={settlementModal.fromUser as any}
        toUser={settlementModal.toUser as any}
        suggestedAmount={settlementModal.suggestedAmount}
        initialData={settlementModal.initialData}
        users={users}
      />
    </>
  );
}
