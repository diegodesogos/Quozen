import { describe, it, expect } from "vitest";
import { SheetDataMapper } from "../../src/infrastructure/SheetDataMapper";

describe("SheetDataMapper", () => {
    it("maps to Expense correctly", () => {
        const row = [
            "exp-123",
            "2023-01-01T10:00:00Z",
            "Dinner",
            "50,5",
            "u1",
            "Food",
            JSON.stringify([{ userId: "u1", amount: 25.25 }, { userId: "u2", amount: 25.25 }]),
            JSON.stringify({ createdAt: "2023-01-01T10:00:00Z", lastModified: "2023-01-02T10:00:00Z" })
        ];

        const mapped = SheetDataMapper.mapToExpense(row, 2);

        expect(mapped.rowIndex).toBe(2);
        expect(mapped.entity.id).toBe("exp-123");
        expect(mapped.entity.amount).toBe(50.5);
        expect(mapped.entity.splits).toHaveLength(2);
        expect(mapped.entity.splits[0].userId).toBe("u1");
        expect(mapped.entity.createdAt.toISOString()).toBe("2023-01-01T10:00:00.000Z");
        expect(mapped.entity.updatedAt.toISOString()).toBe("2023-01-02T10:00:00.000Z");
    });

    it("maps from Expense correctly", () => {
        const expense = {
            id: "exp-123",
            date: new Date("2023-01-01T10:00:00Z"),
            description: "Dinner",
            amount: 50.5,
            paidByUserId: "u1",
            category: "Food",
            splits: [{ userId: "u1", amount: 25.25 }, { userId: "u2", amount: 25.25 }],
            createdAt: new Date("2023-01-01T10:00:00Z"),
            updatedAt: new Date("2023-01-02T10:00:00Z"),
        };

        const row = SheetDataMapper.mapFromExpense(expense);

        expect(row[0]).toBe("exp-123");
        expect(row[1]).toBe("2023-01-01T10:00:00.000Z");
        expect(row[3]).toBe(50.5);
        expect(JSON.parse(row[6])).toEqual(expense.splits);
        expect(JSON.parse(row[7]).createdAt).toBe("2023-01-01T10:00:00.000Z");
    });

    it("maps to Settlement correctly", () => {
        const row = [
            "set-123",
            "2023-01-01T10:00:00Z",
            "u1",
            "u2",
            "20.25",
            "venmo",
            "Thanks"
        ];

        const mapped = SheetDataMapper.mapToSettlement(row, 3);
        expect(mapped.rowIndex).toBe(3);
        expect(mapped.entity.amount).toBe(20.25);
        expect(mapped.entity.fromUserId).toBe("u1");
    });

    it("maps from Settlement correctly", () => {
        const settlement = {
            id: "set-123",
            date: new Date("2023-01-01T10:00:00Z"),
            fromUserId: "u1",
            toUserId: "u2",
            amount: 20.25,
            method: "venmo",
            notes: "Thanks"
        };

        const row = SheetDataMapper.mapFromSettlement(settlement);
        expect(row[4]).toBe(20.25);
    });
});
