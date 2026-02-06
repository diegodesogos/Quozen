import { describe, it, expect } from "vitest";
import { calculateBalances } from "../finance";
import { Member, Expense, Settlement } from "../storage/types";

describe("Finance Settlement Scenarios", () => {
  // --- Helpers ---
  const createMember = (id: string, name: string): Member => ({
    userId: id,
    name,
    email: `${name.toLowerCase()}@example.com`,
    role: "member",
    joinedAt: new Date().toISOString(),
  });

  const createExpense = (
    amount: number,
    paidBy: string,
    splits: { userId: string; amount: number }[]
  ): Expense => ({
    id: crypto.randomUUID(),
    description: "Test Expense",
    amount,
    paidBy,
    category: "Test",
    date: new Date().toISOString(),
    splits,
    meta: { createdAt: new Date().toISOString() },
  });

  const createSettlement = (
    fromUserId: string,
    toUserId: string,
    amount: number
  ): Settlement => ({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    fromUserId,
    toUserId,
    amount,
    method: "cash",
  });

  // --- Scenarios ---

  it("Scenario 1: No expenses, no settlements (Zero Balance)", () => {
    const users = [createMember("u1", "Alice"), createMember("u2", "Bob")];
    const balances = calculateBalances(users, [], []);

    expect(balances["u1"]).toBe(0);
    expect(balances["u2"]).toBe(0);
  });

  it("Scenario 2: Simple Debt (Alice pays for Bob)", () => {
    const users = [createMember("u1", "Alice"), createMember("u2", "Bob")];
    // Alice pays 100, split: Alice 50, Bob 50
    const expense = createExpense(100, "u1", [
      { userId: "u1", amount: 50 },
      { userId: "u2", amount: 50 },
    ]);

    const balances = calculateBalances(users, [expense], []);

    // Alice: Paid 100, Consumed 50. Balance +50.
    // Bob: Paid 0, Consumed 50. Balance -50.
    expect(balances["u1"]).toBe(50);
    expect(balances["u2"]).toBe(-50);
  });

  it("Scenario 3: Full Settlement (Bob pays Alice back)", () => {
    const users = [createMember("u1", "Alice"), createMember("u2", "Bob")];
    const expense = createExpense(100, "u1", [
      { userId: "u1", amount: 50 },
      { userId: "u2", amount: 50 },
    ]);
    
    // Bob pays Alice 50
    const settlement = createSettlement("u2", "u1", 50);

    const balances = calculateBalances(users, [expense], [settlement]);

    expect(balances["u1"]).toBe(0);
    expect(balances["u2"]).toBe(0);
  });

  it("Scenario 4: Partial Settlement (Bob pays Alice less than owed)", () => {
    const users = [createMember("u1", "Alice"), createMember("u2", "Bob")];
    const expense = createExpense(100, "u1", [
      { userId: "u1", amount: 50 },
      { userId: "u2", amount: 50 },
    ]);
    
    // Bob pays Alice 20 (still owes 30)
    const settlement = createSettlement("u2", "u1", 20);

    const balances = calculateBalances(users, [expense], [settlement]);

    // Alice: +50 (owed) - 20 (received) = +30
    // Bob: -50 (owes) + 20 (paid) = -30
    expect(balances["u1"]).toBe(30);
    expect(balances["u2"]).toBe(-30);
  });

  it("Scenario 5: Overpayment (Bob pays Alice more than owed)", () => {
    const users = [createMember("u1", "Alice"), createMember("u2", "Bob")];
    const expense = createExpense(100, "u1", [
      { userId: "u1", amount: 50 },
      { userId: "u2", amount: 50 },
    ]);
    
    // Bob pays Alice 60 (overpays by 10)
    const settlement = createSettlement("u2", "u1", 60);

    const balances = calculateBalances(users, [expense], [settlement]);

    // Alice: +50 - 60 = -10 (Now Alice owes Bob 10)
    // Bob: -50 + 60 = +10 (Now Bob is owed 10)
    expect(balances["u1"]).toBe(-10);
    expect(balances["u2"]).toBe(10);
  });

  it("Scenario 6: Rounding / Floating Point Precision (3 users split 100)", () => {
    // This tests the "app should solve this by rounding values with a +-5 cents variation/error margin" requirement.
    // In practice, balances should sum to zero. 
    
    const users = [
        createMember("u1", "A"), 
        createMember("u2", "B"), 
        createMember("u3", "C")
    ];

    // 100 / 3 = 33.3333...
    // If the system saves high precision:
    const preciseAmount = 100 / 3; 
    
    // Case A: High precision splits stored
    const expense = createExpense(100, "u1", [
      { userId: "u1", amount: preciseAmount },
      { userId: "u2", amount: preciseAmount },
      { userId: "u3", amount: preciseAmount },
    ]);

    const balances = calculateBalances(users, [expense], []);

    // A: Paid 100, Consumed 33.333... Balance = 66.666...
    // B: Consumed 33.333... Balance = -33.333...
    // C: Consumed 33.333... Balance = -33.333...
    
    // Sum of balances should be effectively 0
    const sum = balances["u1"] + balances["u2"] + balances["u3"];
    expect(sum).toBeCloseTo(0, 5); // Verify sum is zero within precision

    // Verify individual balances
    expect(balances["u1"]).toBeCloseTo(66.67, 1); // Close to 66.66...
    expect(balances["u2"]).toBeCloseTo(-33.33, 1);
    expect(balances["u3"]).toBeCloseTo(-33.33, 1);
  });

  it("Scenario 7: Manual Uneven Split with Settlement (Rounding Check)", () => {
    // Simulating user manually entering truncated values
    // Total 100. Split 33.33, 33.33, 33.33. 
    // Total Split Sum = 99.99. 
    // Residual 0.01 exists. Payer paid 100.
    
    const users = [createMember("u1", "A"), createMember("u2", "B"), createMember("u3", "C")];
    
    const expense = createExpense(100, "u1", [
      { userId: "u1", amount: 33.33 },
      { userId: "u2", amount: 33.33 },
      { userId: "u3", amount: 33.33 },
    ]);

    const balances = calculateBalances(users, [expense], []);

    // A: Paid 100. Consumed 33.33. Net +66.67.
    // B: Consumed 33.33. Net -33.33.
    // C: Consumed 33.33. Net -33.33.
    // Check: 66.67 - 33.33 - 33.33 = 0.01.
    // This 0.01 is effectively "owed to A" because A paid 100 but only 99.99 was accounted for in debts.
    // However, the `calculateBalances` logic is:
    // bal[payer] += amount (100)
    // bal[splitter] -= splitAmount (33.33)
    
    // bal[A] = +100 - 33.33 = +66.67
    // bal[B] = -33.33
    // bal[C] = -33.33
    // Sum = +0.01. The system has created money? No, the system reflects the ledger.
    // Ideally, the sum of all balances should be 0.
    // 100 (in) - 99.99 (out) != 0.
    
    // The requirement says: "app should solve this by rounding values with a +-5 cents variation/error margin".
    // This usually means the SETTLEMENT suggestion or display might round it off, 
    // OR valid splits must sum to Total.
    // The ExpenseForm component enforces splits matching amount (~0.05 margin).
    // So this scenario is technically valid per input validation.
    
    // Let's settle B and C fully.
    const s1 = createSettlement("u2", "u1", 33.33);
    const s2 = createSettlement("u3", "u1", 33.33);
    
    const balancesAfter = calculateBalances(users, [expense], [s1, s2]);
    
    expect(balancesAfter["u1"]).toBeCloseTo(0.01, 5); // A keeps the rounding penny
    expect(balancesAfter["u2"]).toBe(0);
    expect(balancesAfter["u3"]).toBe(0);
    
    // This confirms the logic holds up even with rounding artifacts.
  });

  it("Scenario 8: Complex Multiple Expenses and Settlements", () => {
    const users = [createMember("u1", "A"), createMember("u2", "B")];
    
    // A pays 50 (shared) -> A:+25, B:-25
    const e1 = createExpense(50, "u1", [{ userId: "u1", amount: 25 }, { userId: "u2", amount: 25 }]);
    
    // B pays 20 (shared) -> B:+10, A:-10
    const e2 = createExpense(20, "u2", [{ userId: "u1", amount: 10 }, { userId: "u2", amount: 10 }]);
    
    // Current Net:
    // A: +25 - 10 = +15
    // B: -25 + 10 = -15
    
    // Settlement: B pays A 10 (partial)
    const s1 = createSettlement("u2", "u1", 10);
    
    const balances = calculateBalances(users, [e1, e2], [s1]);
    
    // Expected:
    // A: +15 - 10 (received) = +5
    // B: -15 + 10 (paid) = -5
    expect(balances["u1"]).toBe(5);
    expect(balances["u2"]).toBe(-5);
  });
});
