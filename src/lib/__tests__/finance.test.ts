import { describe, it, expect } from "vitest";
import { calculateBalances, suggestSettlementStrategy } from "../finance";
import { Member, Expense, Settlement } from "../storage/types";

describe("Finance Utilities", () => {
  const mockUsers = [
    { userId: "alice", name: "Alice" },
    { userId: "bob", name: "Bob" },
    { userId: "charlie", name: "Charlie" }
  ] as Member[];

  it("calculates balances correctly for a simple expense", () => {
    const expenses = [{
      id: "1",
      paidBy: "alice",
      amount: 30,
      splits: [
        { userId: "alice", amount: 10 },
        { userId: "bob", amount: 10 },
        { userId: "charlie", amount: 10 }
      ]
    }] as Expense[];

    const balances = calculateBalances(mockUsers, expenses, []);
    
    // Alice paid 30, consumed 10. Balance +20.
    // Bob consumed 10. Balance -10.
    // Charlie consumed 10. Balance -10.
    expect(balances["alice"]).toBe(20);
    expect(balances["bob"]).toBe(-10);
    expect(balances["charlie"]).toBe(-10);
  });

  it("calculates balances with settlements", () => {
    const expenses = [{
      id: "1",
      paidBy: "alice",
      amount: 30,
      splits: [
        { userId: "alice", amount: 10 },
        { userId: "bob", amount: 10 },
        { userId: "charlie", amount: 10 }
      ]
    }] as Expense[];

    // Bob pays Alice 10
    const settlements = [{
      id: "s1",
      fromUserId: "bob",
      toUserId: "alice",
      amount: 10
    }] as Settlement[];

    const balances = calculateBalances(mockUsers, expenses, settlements);

    // Alice: +20 (expense) + 10 (settlement) - 10 (her share) ? 
    // Wait, previous calc: +20. Settlement: Alice receives 10. 
    // Logic: bal[to] -= amount? No, if I receive money, my 'owed' balance decreases?
    // Let's check logic in finance.ts:
    // if (bal[settlement.fromUserId] !== undefined) bal[settlement.fromUserId] += amount;
    // if (bal[settlement.toUserId] !== undefined) bal[settlement.toUserId] -= amount;
    
    // Bob (Start -10). Pays 10. Balance should go to 0. (-10 + 10 = 0). Correct.
    // Alice (Start +20). Receives 10. Balance should go to +10 (She is owed less now). (+20 - 10 = 10). Correct.
    
    expect(balances["alice"]).toBe(10);
    expect(balances["bob"]).toBe(0);
    expect(balances["charlie"]).toBe(-10);
  });

  it("suggests correct settlement when user owes money", () => {
    // Alice: +20, Bob: -5, Charlie: -15
    const balances = { "alice": 20, "bob": -5, "charlie": -15 };
    
    // Charlie owes 15. Alice is owed 20.
    // Charlie should pay Alice.
    const suggestion = suggestSettlementStrategy("charlie", balances, mockUsers);
    
    expect(suggestion).toEqual({
        fromUserId: "charlie",
        toUserId: "alice",
        amount: 15
    });
  });

  it("suggests correct settlement when user is owed money", () => {
    // Alice: +20, Bob: -5, Charlie: -15
    const balances = { "alice": 20, "bob": -5, "charlie": -15 };
    
    // Alice is owed 20. Charlie owes the most (-15).
    // Suggest Alice requests 15 from Charlie.
    const suggestion = suggestSettlementStrategy("alice", balances, mockUsers);
    
    expect(suggestion).toEqual({
        fromUserId: "charlie",
        toUserId: "alice",
        amount: 15
    });
  });
});
