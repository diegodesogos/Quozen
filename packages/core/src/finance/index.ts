import { Expense, Settlement, Member } from "../domain/models";


/**
 * Rounds a number to 2 decimal places to ensure currency consistency.
 * Uses Math.round((n + Number.EPSILON) * 100) / 100 to handle float edge cases.
 */
export function roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateBalances(
    users: Member[],
    expenses: Expense[],
    settlements: Settlement[]
): Record<string, number> {
    const bal: Record<string, number> = {};
    users.forEach(u => bal[u.userId] = 0);

    // Process expenses
    expenses.forEach(expense => {
        // Logic Refactor:
        // Instead of crediting Payer with Total Amount and debiting everyone (including payer),
        // we only debit the *other* participants and credit the Payer for *those specific amounts*.
        // This ensures that PayerBalance = Sum(DebtorsBalance) regardless of whether
        // expense.amount matches sum(expense.splits).
        // The splits are the source of truth for debt.

        const payerId = expense.paidByUserId;

        if (expense.splits) {
            expense.splits.forEach((split: any) => {
                const rawAmount = typeof split.amount === 'string' ? split.amount : String(split.amount || 0);
                const splitAmount = parseFloat(rawAmount.replace(',', '.'));
                const roundedAmount = roundCurrency(splitAmount);

                // If Payer is paying for themselves, no debt is created. Skip.
                if (split.userId === payerId) {
                    return;
                }

                // Payer lends money to Splitter
                if (bal[payerId] !== undefined) {
                    bal[payerId] += roundedAmount;
                }

                // Splitter borrows money
                if (bal[split.userId] !== undefined) {
                    bal[split.userId] -= roundedAmount;
                }
            });
        }
    });

    // Process settlements
    settlements.forEach(settlement => {
        const rawAmount = typeof settlement.amount === 'string' ? settlement.amount : String(settlement.amount || 0);
        const amount = parseFloat(rawAmount.replace(',', '.'));
        const roundedAmount = roundCurrency(amount);

        if (bal[settlement.fromUserId] !== undefined) {
            bal[settlement.fromUserId] += roundedAmount;
        }
        if (bal[settlement.toUserId] !== undefined) {
            bal[settlement.toUserId] -= roundedAmount;
        }
    });

    // Final rounding pass just in case of accumulated float noise in summation
    Object.keys(bal).forEach(userId => {
        bal[userId] = roundCurrency(bal[userId]);
    });

    return bal;
}

export function calculateTotalSpent(userId: string, expenses: Expense[]): number {
    const total = expenses.reduce((sum, exp) => {
        const mySplit = exp.splits?.find((s: any) => s.userId === userId);
        return sum + (mySplit?.amount || 0);
    }, 0);

    return roundCurrency(total);
}

export type ExpenseUserStatus =
    | { status: 'payer'; amountPaid: number; lentAmount: number }
    | { status: 'debtor'; amountOwed: number }
    | { status: 'none' };

export function getExpenseUserStatus(expense: Expense, userId: string): ExpenseUserStatus {
    const rawTotalAmount = typeof expense.amount === 'string' ? expense.amount : String(expense.amount || 0);
    const amount = parseFloat(rawTotalAmount.replace(',', '.'));
    const userSplit = expense.splits?.find(s => s.userId === userId);
    const splitAmount = userSplit?.amount || 0;

    // Refactor logic to match calculateBalances (Consolidated view)

    if (expense.paidByUserId === userId) {
        // I paid.
        // My "Lent Amount" is effectively the sum of everyone else's splits.
        // Or simpler: Total Amount - My Split.
        // To match calculateBalances exactly, we should sum others.

        let lent = 0;
        if (expense.splits) {
            lent = expense.splits
                .filter((s: any) => s.userId !== userId)
                .reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
        }

        return {
            status: 'payer',
            amountPaid: amount,
            lentAmount: roundCurrency(lent)
        };
    }

    if (splitAmount > 0) {
        return {
            status: 'debtor',
            amountOwed: roundCurrency(splitAmount)
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
        amount: roundCurrency(amount)
    };
}

/**
 * Calculates the suggested settlement between the current user and another user
 * based on their current balances.
 */
export function getDirectSettlementDetails(
    currentUserId: string,
    currentBalance: number,
    otherUserId: string,
    otherBalance: number
): { amount: number; fromUserId: string; toUserId: string } {
    let amount = 0;
    let fromUserId = currentUserId;
    let toUserId = otherUserId;

    // Calculate logical settlement: Intersection of absolute balances if signs are opposite
    if ((currentBalance < 0 && otherBalance > 0) || (currentBalance > 0 && otherBalance < 0)) {
        amount = Math.min(Math.abs(currentBalance), Math.abs(otherBalance));
    }

    // Determine direction
    if (currentBalance < 0) {
        fromUserId = currentUserId;
        toUserId = otherUserId;
    } else {
        fromUserId = otherUserId;
        toUserId = currentUserId;
    }

    return { amount: roundCurrency(amount), fromUserId, toUserId };
}

/**
 * Distributes a total amount into 'n' parts, ensuring the sum of parts equals the total exactly.
 * Useful for splitting expenses without floating point rounding errors (pennies).
 */
export function distributeAmount(total: number, count: number): number[] {
    if (count <= 0) return [];

    // Work with integers (cents) to avoid float errors
    const totalCents = Math.round(total * 100);
    const baseSplitCents = Math.floor(totalCents / count);
    const remainderCents = totalCents % count;

    const results = [];
    for (let i = 0; i < count; i++) {
        // Distribute remainder one cent at a time
        let valCents = baseSplitCents;
        if (i < remainderCents) {
            valCents += 1;
        }
        results.push(valCents / 100);
    }

    return results;
}
