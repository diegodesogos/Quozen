import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SettlementModal from "@/components/settlement-modal";
import { useState, useMemo } from "react";
import { Utensils, Car, Bed, ShoppingBag, Gamepad2, MoreHorizontal } from "lucide-react";
import { googleApi } from "@/lib/drive";
import { useNavigate } from "react-router-dom";

interface User {
  userId: string; // Changed from id to userId to match Sheet schema
  name: string;
  email: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number; // Changed to number
  paidBy: string;
  category: string;
  date: string;
  splits: { userId: string; amount: number }[];
}

interface Settlement {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export default function Dashboard() {
  const { activeGroupId, currentUserId } = useAppContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [settlementModal, setSettlementModal] = useState<{
    isOpen: boolean;
    fromUser?: { id: string; name: string };
    toUser?: { id: string; name: string };
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
  const users = (groupData?.members || []) as User[];
  
  // Derived state: Current User Object
  const currentUser = users.find(u => u.userId === currentUserId);
  
  // Helper to finding users
  const getUserById = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u ? { id: u.userId, name: u.name, email: u.email } : undefined;
  };

  // Client-side Balance Calculation
  const balances = useMemo(() => {
    const bal: Record<string, number> = {};
    users.forEach(u => bal[u.userId] = 0);

    // Process expenses
    expenses.forEach(expense => {
      const amount = typeof expense.amount === 'string' ? parseFloat(expense.amount) : expense.amount;
      
      // Credit payer
      if (bal[expense.paidBy] !== undefined) {
        bal[expense.paidBy] += amount;
      }

      // Debit splitters
      expense.splits?.forEach(split => {
        if (bal[split.userId] !== undefined) {
          bal[split.userId] -= split.amount;
        }
      });
    });

    // Process settlements
    settlements.forEach(settlement => {
      const amount = typeof settlement.amount === 'string' ? parseFloat(settlement.amount) : settlement.amount;
      
      if (bal[settlement.fromUserId] !== undefined) {
        bal[settlement.fromUserId] += amount;
      }
      if (bal[settlement.toUserId] !== undefined) {
        bal[settlement.toUserId] -= amount;
      }
    });

    return bal;
  }, [expenses, settlements, users]);

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

  const handleSettleUp = () => {
    if (!currentUser) return;
    
    // Calculate balances relative to current user
    const participantBalances = users
      .filter(u => u.userId !== currentUserId)
      .map(u => ({
        user: { id: u.userId, name: u.name },
        balance: balances[u.userId] || 0
      }));

    if (participantBalances.length === 0) return;

    // Simple heuristic: 
    // If I owe money (my balance < 0), I should pay the person who is owed the most (max balance).
    // If I am owed money (my balance > 0), the person who owes the most (min balance) should pay me.
    let target;
    if (userBalance < 0) {
        // Find who is owed the most (positive balance)
        target = participantBalances.reduce((max, p) => p.balance > max.balance ? p : max, participantBalances[0]);
    } else {
        // Find who owes the most (negative balance)
        target = participantBalances.reduce((min, p) => p.balance < min.balance ? p : min, participantBalances[0]);
    }

    const amount = Math.min(Math.abs(userBalance), Math.abs(target.balance));

    setSettlementModal({
      isOpen: true,
      fromUser: userBalance < 0 ? { id: currentUser.userId, name: currentUser.name } : target.user,
      toUser: userBalance < 0 ? target.user : { id: currentUser.userId, name: currentUser.name },
      suggestedAmount: amount,
    });
  };

  const handleSettleWith = (userId: string) => {
    if (!currentUser) return;
    const otherUser = getUserById(userId);
    if (!otherUser) return;

    // For direct settlement, we might just look at the relationship, 
    // but for now let's just set up the modal direction based on overall balances
    const otherBalance = balances[userId] || 0;
    
    // If I'm negative and they are positive, I pay them.
    // If I'm positive and they are negative, they pay me.
    const iPay = userBalance < 0 && otherBalance > 0;
    
    setSettlementModal({
      isOpen: true,
      fromUser: iPay ? { id: currentUser.userId, name: currentUser.name } : otherUser,
      toUser: iPay ? otherUser : { id: currentUser.userId, name: currentUser.name },
      suggestedAmount: 0, // Let user decide amount
    });
  };
  
  // Settlement mutation
  const settlementMutation = useMutation({
    mutationFn: async (data: any) => {
       return await googleApi.addSettlement(activeGroupId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
    }
  });

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
        <div className="mx-4 mt-4 bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Your Balance</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={handleSettleUp}
              data-testid="button-settle-up"
            >
              Settle Up
            </Button>
          </div>
          <div className="text-center py-4">
            <div 
              className={`text-3xl font-bold ${userBalance >= 0 ? 'expense-positive' : 'expense-negative'}`}
              data-testid="text-user-balance"
            >
              {userBalance >= 0 ? '+' : ''}${Math.abs(userBalance).toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {userBalance >= 0 ? 'You are owed overall' : 'You owe overall'}
            </p>
          </div>
        </div>

        {/* Participants & Balances */}
        <div className="mx-4 bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Group Balances</h3>
          </div>
          <div className="divide-y divide-border">
            {users
              .filter(u => u.userId !== currentUserId)
              .map((u) => {
                const balance = balances[u.userId] || 0;

                return (
                  <div key={u.userId} className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                        <span className="text-primary-foreground font-medium text-sm">
                          {u.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{u.name}</p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
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
                        variant="ghost"
                        size="sm"
                        className="text-xs text-primary h-auto p-0"
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
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Recent Expenses</h3>
              <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-primary" 
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
                <p className="text-muted-foreground">No expenses yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add your first expense to get started</p>
              </div>
            ) : (
              recentExpenses.map((expense) => {
                const paidByUser = getUserById(expense.paidBy);
                const userSplit = expense.splits?.find(s => s.userId === currentUserId);
                const yourShare = userSplit?.amount || 0;
                const Icon = getExpenseIcon(expense.category);

                return (
                  <div key={expense.id} className="p-4" data-testid={`expense-item-${expense.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                          <Icon className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{expense.description}</p>
                          <p className="text-sm text-muted-foreground">
                            Paid by {paidByUser?.name} • {new Date(expense.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-foreground">${Number(expense.amount).toFixed(2)}</div>
                        {expense.paidBy === currentUserId ? (
                          <div className="text-sm expense-positive">
                            You paid
                          </div>
                        ) : (
                          <div className="text-sm expense-negative">
                            You owe ${yourShare.toFixed(2)}
                          </div>
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

      {/* We pass a wrapper to onClose to handle the mutation if needed, but for now just close */}
      <SettlementModal
        isOpen={settlementModal.isOpen}
        onClose={() => setSettlementModal({ isOpen: false })}
        fromUser={settlementModal.fromUser as any} // Cast to match component expectations if slight mismatch
        toUser={settlementModal.toUser as any}
        suggestedAmount={settlementModal.suggestedAmount}
      />
    </>
  );
}
