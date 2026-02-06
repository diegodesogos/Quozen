import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Button } from "@/components/ui/button";
import SettlementModal from "@/components/settlement-modal";
import { useState, useMemo } from "react";
import { Utensils, Car, Bed, ShoppingBag, Gamepad2, MoreHorizontal, Wallet } from "lucide-react";
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

export default function Dashboard() {
  const { activeGroupId, currentUserId } = useAppContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [settlementModal, setSettlementModal] = useState<{
    isOpen: boolean;
    fromUser?: { userId: string; name: string };
    toUser?: { userId: string; name: string };
    suggestedAmount?: number;
  }>({ isOpen: false });

  // Fetch all group data from Drive
  const { data: groupData, isLoading } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId),
    enabled: !!activeGroupId,
  });

  const expenses = (groupData?.expenses || []) as Expense[];
  const settlements = (groupData?.settlements || []) as Settlement[];
  const users = (groupData?.members || []) as Member[];

  // Derived state: Current User Object
  const currentUser = users.find(u => u.userId === currentUserId);

  // Helper to finding users
  const getUserById = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u ? { userId: u.userId, name: u.name, email: u.email } : undefined;
  };

  // Client-side Balance Calculation
  const balances = useMemo(() => {
    return calculateBalances(users, expenses, settlements);
  }, [expenses, settlements, users]);

  // Use Centralized Finance Logic for Total Spent
  const totalSpent = useMemo(() => {
    return calculateTotalSpent(currentUserId, expenses);
  }, [expenses, currentUserId]);

  const userBalance = balances[currentUserId] || 0;
  const recentExpenses = [...expenses].reverse().slice(0, 3);

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

  // Determine if settlement is needed for "Settle Up" button state
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
        suggestedAmount: settlementSuggestion.amount
      });
    }
  };

  const handleSettleWith = (userId: string) => {
    if (!currentUser) return;
    const otherUser = getUserById(userId);
    if (!otherUser) return;

    const otherBalance = balances[userId] || 0;

    // Delegate business logic to finance lib
    const settlement = getDirectSettlementDetails(
      currentUser.userId,
      userBalance,
      userId,
      otherBalance
    );

    const fromUser = getUserById(settlement.fromUserId);
    const toUser = getUserById(settlement.toUserId);

    if (fromUser && toUser) {
      setSettlementModal({
        isOpen: true,
        fromUser,
        toUser,
        suggestedAmount: settlement.amount, 
      });
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center">Loading group data...</div>;
  }

  if (!groupData) {
    return <div className="p-4 text-center">Group not found.</div>;
  }

  return (
    <>
      <div className="space-y-4" data-testid="dashboard-view">
        {/* Balance Overview Card */}
        <div className="mx-4 mt-4 bg-card rounded-lg border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" /> Your Balance
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="text-primary hover:text-primary border-primary/20 hover:bg-primary/10"
              onClick={handleSettleUp}
              disabled={!settlementSuggestion}
              data-testid="button-settle-up"
            >
              Settle Up
            </Button>
          </div>
          <div className="text-center py-2">
            <div
              className={`text-4xl font-bold ${userBalance >= 0 ? 'expense-positive' : 'expense-negative'}`}
              data-testid="text-user-balance"
            >
              {userBalance >= 0 ? '+' : ''}${Math.abs(userBalance).toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {userBalance >= 0 ? 'You are owed overall' : 'You owe overall'}
            </p>

            <div className="mt-4 pt-4 border-t border-dashed border-border flex justify-between items-center px-8">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Spent</span>
              <span className="font-medium text-foreground">${totalSpent.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Participants & Balances */}
        <div className="mx-4 bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border bg-muted/30">
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">Group Balances</h3>
          </div>
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
                        {u.role === 'owner' && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Owner</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-semibold ${balance >= 0 ? 'expense-positive' : 'expense-negative'}`}
                        data-testid={`text-balance-${u.userId}`}
                      >
                        {balance >= 0 ? '+' : ''}${Math.abs(balance).toFixed(2)}
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="text-xs text-muted-foreground h-auto p-0 hover:text-primary"
                        onClick={() => handleSettleWith(u.userId)}
                        data-testid={`button-settle-with-${u.userId}`}
                      >
                        Settle
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Recent Expenses */}
        <div className="mx-4 bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">Recent Activity</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-primary h-8"
                data-testid="button-view-all-expenses"
                onClick={() => navigate('/expenses')}
              >
                View All
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border">
            {recentExpenses.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground text-sm">No expenses yet</p>
                <Button variant="link" onClick={() => navigate('/add-expense')} className="mt-2">Add your first expense</Button>
              </div>
            ) : (
              recentExpenses.map((expense) => {
                const paidByUser = getUserById(expense.paidBy);
                const Icon = getExpenseIcon(expense.category);

                // Use centralized logic for status
                const status = getExpenseUserStatus(expense, currentUserId);

                return (
                  <div key={expense.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/edit-expense/${expense.id}`)} data-testid={`expense-item-${expense.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center border border-border">
                          <Icon className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{expense.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {paidByUser?.name || 'Unknown'} • {new Date(expense.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-foreground text-sm">${Number(expense.amount).toFixed(2)}</div>

                        {status.status === 'payer' && (
                          <div className="text-xs expense-positive">You paid</div>
                        )}
                        {status.status === 'debtor' && (
                          <div className="text-xs expense-negative">Owe ${status.amountOwed.toFixed(2)}</div>
                        )}
                        {status.status === 'none' && (
                          <div className="text-xs text-muted-foreground">Not involved</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <SettlementModal
        isOpen={settlementModal.isOpen}
        onClose={() => setSettlementModal({ isOpen: false })}
        fromUser={settlementModal.fromUser as any}
        toUser={settlementModal.toUser as any}
        suggestedAmount={settlementModal.suggestedAmount}
      />
    </>
  );
}
