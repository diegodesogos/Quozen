import { Expense, Settlement, Member } from "./storage/types";

export function calculateBalances(
  users: Member[],
  expenses: Expense[],
  settlements: Settlement[]
): Record<string, number> {
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
    expense.splits?.forEach((split: any) => {
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
}

export function calculateTotalSpent(userId: string, expenses: Expense[]): number {
  return expenses.reduce((total, exp) => {
    const mySplit = exp.splits?.find((s: any) => s.userId === userId);
    return total + (mySplit?.amount || 0);
  }, 0);
}

export type ExpenseUserStatus =
  | { status: 'payer'; amountPaid: number; lentAmount: number }
  | { status: 'debtor'; amountOwed: number }
  | { status: 'none' };

export function getExpenseUserStatus(expense: Expense, userId: string): ExpenseUserStatus {
  const amount = typeof expense.amount === 'string' ? parseFloat(expense.amount) : expense.amount;
  const userSplit = expense.splits?.find(s => s.userId === userId);
  const splitAmount = userSplit?.amount || 0;

  if (expense.paidBy === userId) {
    // I paid. I lent (Total - MyShare)
    // If I didn't participate in split, I lent everything.
    return {
      status: 'payer',
      amountPaid: amount,
      lentAmount: amount - splitAmount
    };
  }

  if (splitAmount > 0) {
    return {
      status: 'debtor',
      amountOwed: splitAmount
    };
  }

  return { status: 'none' };
}

export function suggestSettlementStrategy(
  currentUserId: string,
  balances: Record<string, number>,
  users: Member[]
) {
  const userBalance = balances[currentUserId] || 0;
  if (Math.abs(userBalance) < 0.01) return null;

  // Filter out current user and map to object
  const participantBalances = users
    .filter(u => u.userId !== currentUserId)
    .map(u => ({
      userId: u.userId,
      name: u.name,
      balance: balances[u.userId] || 0
    }));

  if (participantBalances.length === 0) return null;

  // Heuristic: 
  // If I owe money (< 0), pay the person owed the most (> 0).
  // If I am owed money (> 0), request from person who owes the most (< 0).
  let target;
  if (userBalance < 0) {
    // Find who is owed the most (max positive balance)
    target = participantBalances.reduce((max, p) => p.balance > max.balance ? p : max, participantBalances[0]);
  } else {
    // Find who owes the most (min negative balance)
    target = participantBalances.reduce((min, p) => p.balance < min.balance ? p : min, participantBalances[0]);
  }

  const amount = Math.min(Math.abs(userBalance), Math.abs(target.balance));

  return {
    fromUserId: userBalance < 0 ? currentUserId : target.userId,
    toUserId: userBalance < 0 ? target.userId : currentUserId,
    amount
  };
}
