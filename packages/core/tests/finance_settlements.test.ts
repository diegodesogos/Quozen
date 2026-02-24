import { describe, it, expect } from "vitest";
import { Member, Expense, Settlement } from "../src/domain/models";
import { calculateBalances } from "../src/finance";

describe("Finance Settlements Logic", () => {
  const users: Member[] = [
    { userId: "u1", name: "Alice", email: "", role: "member" as const, joinedAt: new Date() },
    { userId: "u2", name: "Bob", email: "", role: "member" as const, joinedAt: new Date() },
    { userId: "u3", name: "Charlie", email: "", role: "member" as const, joinedAt: new Date() }
  ];

  const createExpense = (id: string, amount: number, paidBy: string, splits: { userId: string, amount: number }[]) => ({
    id,
    description: "test",
    amount,
    paidByUserId: paidBy,
    category: "test",
    date: new Date(),
    splits,
    createdAt: new Date(),
    updatedAt: new Date()
  } as unknown as Expense);

  const createSettlement = (from: string, to: string, amount: number) => ({
    id: Math.random().toString(36),
    date: new Date(),
    fromUserId: from,
    toUserId: to,
    amount,
    method: "cash"
  } as unknown as Settlement);

  it("handles complex settlement chain (Circular Debt Relief)", () => {
    // 1. A pays 30 for B and C (10 each) -> A:+20, B:-10, C:-10
    const e1 = createExpense("e1", 30, "u1", [{ userId: "u1", amount: 10 }, { userId: "u2", amount: 10 }, { userId: "u3", amount: 10 }]);

    // 2. B pays 10 for A -> B:+10, A:-10
    // Net After e1, e2: A:+10, B:0, C:-10
    const e2 = createExpense("e2", 10, "u2", [{ userId: "u1", amount: 10 }]);

    // 3. Charlie (C) settles with Alice (A)
    const s1 = createSettlement("u3", "u1", 10);

    const balances = calculateBalances(users, [e1, e2], [s1]);
    expect(balances["u1"]).toBe(0);
    expect(balances["u2"]).toBe(0);
    expect(balances["u3"]).toBe(0);
  });

  it("handles over-settlement (User pays back more than owed)", () => {
    // Bob owes Alice 10.
    const e1 = createExpense("e1", 20, "u1", [{ userId: "u1", amount: 10 }, { userId: "u2", amount: 10 }]);
    // Bob pays Alice 15.
    const s1 = createSettlement("u2", "u1", 15);

    const balances = calculateBalances(users, [e1], [s1]);
    expect(balances["u1"]).toBe(-5); // Alice now owes Bob 5.
    expect(balances["u2"]).toBe(5);  // Bob is owed 5.
  });

  it("Scenario 2: Settlement with self (should handle but is illogical - no net effect)", () => {
    const s1 = createSettlement("u1", "u1", 100);
    const balances = calculateBalances(users, [], [s1]);
    expect(balances["u1"]).toBe(0);
  });
});
