import { describe, it, expect } from "vitest"
import { Member, Expense } from "../src/domain/models";
import { calculateBalances, calculateTotalSpent, roundCurrency } from "../src/finance";

describe("Finance Rounding Consistency", () => {
  const users: Member[] = [
    { userId: "u1", name: "Alice", email: "", role: "member" as const, joinedAt: new Date() },
    { userId: "u2", name: "Bob", email: "", role: "member" as const, joinedAt: new Date() },
    { userId: "u3", name: "Charlie", email: "", role: "member" as const, joinedAt: new Date() }
  ];

  // Helper to create an expense with specific float values that might cause drift
  const createFloatExpense = (amount: number, split1: number, split2: number) => ({
    id: "e1",
    description: "Float Test",
    amount: amount,
    paidByUserId: "u1",
    category: "Test",
    date: new Date(),
    splits: [
      { userId: "u1", amount: split1 },
      { userId: "u2", amount: split2 }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  } as unknown as Expense);

  it("ensures balances sum to exactly zero (Fixing the 11.29 vs 11.30 issue)", () => {
    const amount = 100;
    const split1 = 33.333333333333336; // 100/3
    const split2 = 66.66666666666667;  // 200/3

    const expense = createFloatExpense(amount, split1, split2);

    const balances = calculateBalances(users, [expense], []);

    expect(balances["u1"]).toBe(66.67);
    expect(balances["u2"]).toBe(-66.67);
    expect(balances["u1"] + balances["u2"]).toBe(0);
  });

  it("calculates total spent with rounding to avoid 11.2999999 displayed as 11.30 vs 11.29 elsewhere", () => {
    const splitAmount = 11.294;
    const expense1 = createFloatExpense(100, splitAmount, 0);
    const total = calculateTotalSpent("u1", [expense1]);
    expect(total).toBe(11.29);
  });

  it("Scenario 9: User Report Reproduction (11.29 vs 11.30)", () => {
    // Simulating the user's specific case:
    // Payer (u1) Balance +11.29.
    // Debtor (u2) Balance -11.30.
    // This happens if Payer's balance is derived from (Amount - SelfSplit) and Debtor from (-OtherSplit),
    // and Amount != Sum(Splits).

    // Expense Amount: 22.59
    // u1 Split: 11.30
    // u2 Split: 11.30
    // Sum Splits: 22.60 (Diff 0.01)

    const expense = {
      id: "e_repro",
      description: "Repro",
      amount: 22.59,
      paidByUserId: "u1",
      splits: [
        { userId: "u1", amount: 11.30 }, // Payer consumes 11.30
        { userId: "u2", amount: 11.30 }  // Bob consumes 11.30
      ]
    } as any;

    const balances = calculateBalances(users, [expense], []);

    expect(balances["u1"]).toBe(11.30);
    expect(balances["u2"]).toBe(-11.30);
    expect(balances["u1"] + balances["u2"]).toBe(0);
  });
});
