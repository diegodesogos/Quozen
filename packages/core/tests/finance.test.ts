import { describe, it, expect } from "vitest";
import { Member, Expense, Settlement } from "../src";
import {
  calculateBalances,
  calculateTotalSpent,
  getExpenseUserStatus,
  suggestSettlementStrategy,
  getDirectSettlementDetails
} from "../src/finance";

describe("Finance Utilities", () => {
  // --- Mock Data Helpers ---
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
    id: "s1",
    date: new Date(),
    fromUserId: from,
    toUserId: to,
    amount,
    method: "cash"
  } as unknown as Settlement);

  // --- calculateBalances ---
  describe("calculateBalances", () => {
    it("returns zero balances for empty inputs", () => {
      const balances = calculateBalances(users, [], []);
      expect(balances).toEqual({ u1: 0, u2: 0, u3: 0 });
    });

    it("calculates correctly for a single expense split equally", () => {
      // Alice pays 30, split 10/10/10
      const exp = createExpense("e1", 30, "u1", [
        { userId: "u1", amount: 10 },
        { userId: "u2", amount: 10 },
        { userId: "u3", amount: 10 }
      ]);
      const balances = calculateBalances(users, [exp], []);

      // Alice: Paid 30, Consumed 10. Balance +20
      // Bob: Consumed 10. Balance -10
      // Charlie: Consumed 10. Balance -10
      expect(balances["u1"]).toBe(20);
      expect(balances["u2"]).toBe(-10);
      expect(balances["u3"]).toBe(-10);
    });

    it("calculates correctly when payer does not participate in split (Gift)", () => {
      // Alice pays 20 for Bob and Charlie (10 each)
      const exp = createExpense("e1", 20, "u1", [
        { userId: "u2", amount: 10 },
        { userId: "u3", amount: 10 }
      ]);
      const balances = calculateBalances(users, [exp], []);

      // Alice: +20
      // Bob: -10
      // Charlie: -10
      expect(balances["u1"]).toBe(20);
      expect(balances["u2"]).toBe(-10);
      expect(balances["u3"]).toBe(-10);
    });

    it("handles multiple expenses", () => {
      // Alice pays 30 (10 each) -> A:+20, B:-10, C:-10
      // Bob pays 15 (Bob 5, Charlie 10) -> B:+10 (+15 paid - 5 consumed), C:-10
      // Net: A:+20, B:0, C:-20
      const e1 = createExpense("e1", 30, "u1", [{ userId: "u1", amount: 10 }, { userId: "u2", amount: 10 }, { userId: "u3", amount: 10 }]);
      const e2 = createExpense("e2", 15, "u2", [{ userId: "u2", amount: 5 }, { userId: "u3", amount: 10 }]);

      const balances = calculateBalances(users, [e1, e2], []);
      expect(balances["u1"]).toBe(20);
      expect(balances["u2"]).toBe(0);
      expect(balances["u3"]).toBe(-20);
    });

    it("processes settlements correctly (reducing debt)", () => {
      // Setup: Bob owes Alice 10.
      const e1 = createExpense("e1", 20, "u1", [{ userId: "u1", amount: 10 }, { userId: "u2", amount: 10 }]);
      // Bob pays Alice 10
      const s1 = createSettlement("u2", "u1", 10);

      const balances = calculateBalances(users, [e1], [s1]);
      expect(balances["u1"]).toBe(0);
      expect(balances["u2"]).toBe(0);
    });

    it("handles unknown users in splits gracefully (ignores them for balance, affects payer)", () => {
      const exp = createExpense("e1", 10, "u1", [
        { userId: "u1", amount: 5 },
        { userId: "u99", amount: 5 }
      ]);
      const balances = calculateBalances(users, [exp], []);

      // Alice: Paid 10, Consumed 5. Balance +5. (She is owed 5 by the unknown entity)
      expect(balances["u1"]).toBe(5);
      expect(balances["u2"]).toBe(0);
    });

    it("BUG REPRO: returns 0 balance if expense ID does not match Member ID (Mismatch case)", () => {
      const members = [
        { userId: "u1", name: "Alice", role: "member" as const, email: "", joinedAt: new Date() },
        { userId: "u2", name: "Bob", role: "member" as const, email: "", joinedAt: new Date() }
      ];

      // Expense uses OLD ID (simulated mismatch)
      const exp = createExpense("e1", 20, "u1", [
        { userId: "u1", amount: 10 },
        { userId: "bob@email.com", amount: 10 }
      ]);

      const balances = calculateBalances(members, [exp], []);

      expect(balances["u1"]).toBe(10);
      expect(balances["u2"]).toBe(0);
    });

    it("BUG-01: handles small amounts (< 0.5) correctly", () => {
      // Alice pays 0.4 for Bob
      const e1 = createExpense("e1", 0.4, "u1", [{ userId: "u2", amount: 0.4 }]);
      const balances = calculateBalances(users, [e1], []);

      expect(balances["u1"]).toBe(0.4);
      expect(balances["u2"]).toBe(-0.4);
    });

    it("BUG-01: handles localized string amounts with commas", () => {
      // Alice pays 0,60 for Bob (localized string)
      const e1 = createExpense("e1", 0.6, "u1", [{ userId: "u2", amount: "0,60" as any }]);
      const s1 = createSettlement("u2", "u1", "0,25" as any); // Partial settlement

      const balances = calculateBalances(users, [e1], [s1]);

      // Alice: +0.60 (lent) - 0.25 (received) = 0.35
      // Bob: -0.60 (owed) + 0.25 (paid) = -0.35
      expect(balances["u1"]).toBe(0.35);
      expect(balances["u2"]).toBe(-0.35);
    });
  });

  // --- calculateTotalSpent ---
  describe("calculateTotalSpent", () => {
    it("returns 0 if no expenses", () => {
      expect(calculateTotalSpent("u1", [])).toBe(0);
    });

    it("sums up only the user's split amounts (Consumption)", () => {
      const e1 = createExpense("e1", 100, "u2", [{ userId: "u1", amount: 25 }, { userId: "u2", amount: 75 }]);
      const e2 = createExpense("e2", 50, "u1", [{ userId: "u1", amount: 50 }]);

      const total = calculateTotalSpent("u1", [e1, e2]);
      expect(total).toBe(75); // 25 + 50
    });

    it("returns 0 if user paid but did not consume (Gift)", () => {
      const e1 = createExpense("e1", 100, "u1", [{ userId: "u2", amount: 100 }]);
      const total = calculateTotalSpent("u1", [e1]);
      expect(total).toBe(0);
    });

    it("handles string amounts safely", () => {
      expect(calculateTotalSpent("u1", [createExpense("e1", 10, "u1", [{ userId: "u1", amount: 10.5 }])])).toBe(10.5);
    });
  });

  // --- getExpenseUserStatus ---
  describe("getExpenseUserStatus", () => {
    it("identifies payer who also consumed", () => {
      const exp = createExpense("e1", 100, "u1", [{ userId: "u1", amount: 50 }, { userId: "u2", amount: 50 }]);
      const status = getExpenseUserStatus(exp, "u1");

      expect(status.status).toBe("payer");
      if (status.status === "payer") {
        expect(status.amountPaid).toBe(100);
        expect(status.lentAmount).toBe(50);
      }
    });

    it("identifies payer who did NOT consume (Full Lender)", () => {
      const exp = createExpense("e1", 100, "u1", [{ userId: "u2", amount: 100 }]);
      const status = getExpenseUserStatus(exp, "u1");

      expect(status.status).toBe("payer");
      if (status.status === "payer") {
        expect(status.lentAmount).toBe(100);
      }
    });

    it("identifies debtor", () => {
      const exp = createExpense("e1", 100, "u1", [{ userId: "u1", amount: 50 }, { userId: "u2", amount: 50 }]);
      const status = getExpenseUserStatus(exp, "u2");

      expect(status.status).toBe("debtor");
      if (status.status === "debtor") {
        expect(status.amountOwed).toBe(50);
      }
    });

    it("identifies uninvolved user", () => {
      const exp = createExpense("e1", 100, "u1", [{ userId: "u1", amount: 100 }]);
      const status = getExpenseUserStatus(exp, "u3");
      expect(status.status).toBe("none");
    });
  });

  // --- suggestSettlementStrategy ---
  describe("suggestSettlementStrategy", () => {
    it("returns null if balance is negligible", () => {
      const balances = { u1: 0.001, u2: -0.001 };
      const suggestion = suggestSettlementStrategy("u1", balances, users);
      expect(suggestion).toBeNull();
    });

    it("suggests payment when user owes money (Negative Balance)", () => {
      const balances = { u1: -50, u2: 50, u3: 0 };
      const suggestion = suggestSettlementStrategy("u1", balances, users);

      expect(suggestion).toEqual({
        fromUserId: "u1",
        toUserId: "u2",
        amount: 50
      });
    });

    it("suggests receiving when user is owed money (Positive Balance)", () => {
      const balances = { u1: 50, u2: -50 };
      const suggestion = suggestSettlementStrategy("u1", balances, users);

      expect(suggestion).toEqual({
        fromUserId: "u2",
        toUserId: "u1",
        amount: 50
      });
    });

    it("prioritizes the largest creditor/debtor", () => {
      const balances = { u1: -50, u2: 10, u3: 40 };
      const suggestion = suggestSettlementStrategy("u1", balances, users);

      expect(suggestion).toEqual({
        fromUserId: "u1",
        toUserId: "u3",
        amount: 40
      });
    });

    it("handles partial settlement caps", () => {
      const balances = { u1: -100, u2: 20, u3: 80 };
      const suggestion = suggestSettlementStrategy("u1", balances, users);

      expect(suggestion?.amount).toBe(80);
      expect(suggestion?.toUserId).toBe("u3");
    });

    it("intelligent selection: allows settling between two OTHER users when invoked on a target", () => {
      // Scenario: Alice (u1) is logged in. She clicks settle on Bob (u2).
      // Balances: Bob (u2) owes 50. Charlie (u3) is owed 50. Alice (u1) is flat.
      const balances = { u1: 0, u2: -50, u3: 50 };

      // We ask strategy for u2 (Bob)
      const suggestion = suggestSettlementStrategy("u2", balances, users);

      expect(suggestion).toEqual({
        fromUserId: "u2", // Bob pays
        toUserId: "u3",   // Charlie receives
        amount: 50
      });
    });
  });

  // --- getDirectSettlementDetails (NEW TESTS) ---
  describe("getDirectSettlementDetails", () => {
    it("calculates amount correctly when current user owes less than other is owed", () => {
      // Alice owes 20, Bob is owed 50. Alice pays Bob 20.
      const result = getDirectSettlementDetails("u1", -20, "u2", 50);
      expect(result).toEqual({ amount: 20, fromUserId: "u1", toUserId: "u2" });
    });

    it("calculates amount correctly when current user owes more than other is owed", () => {
      // Alice owes 50, Bob is owed 20. Alice pays Bob 20.
      const result = getDirectSettlementDetails("u1", -50, "u2", 20);
      expect(result).toEqual({ amount: 20, fromUserId: "u1", toUserId: "u2" });
    });

    it("calculates amount correctly when current user is owed and other owes", () => {
      // Alice owed 30, Bob owes 40. Bob pays Alice 30.
      const result = getDirectSettlementDetails("u1", 30, "u2", -40);
      expect(result).toEqual({ amount: 30, fromUserId: "u2", toUserId: "u1" });
    });

    it("returns 0 amount if both users have same sign (Both owe)", () => {
      // Both owe money to someone else (Charlie). They shouldn't settle with each other.
      const result = getDirectSettlementDetails("u1", -20, "u2", -20);
      expect(result.amount).toBe(0);
    });

    it("returns 0 amount if both users have same sign (Both owed)", () => {
      const result = getDirectSettlementDetails("u1", 20, "u2", 20);
      expect(result.amount).toBe(0);
    });

    it("defaults to correct direction even if amount is 0 (Payer/Receiver based on current user)", () => {
      // Alice owes, Bob owes. Default: Alice pays Bob (arbitrary direction for 0 amount, but predictable)
      // Logic: if current < 0, from=current.
      const result = getDirectSettlementDetails("u1", -10, "u2", -10);
      expect(result.fromUserId).toBe("u1");
      expect(result.amount).toBe(0);
    });
  });
});
