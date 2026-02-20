import { IStorageLayer } from "./IStorageLayer";
import { Expense, Settlement, Member } from "../domain/models";
import { SheetDataMapper } from "./SheetDataMapper";

export class LedgerRepository {
    private expenseRowMap = new Map<string, number>();
    private settlementRowMap = new Map<string, number>();
    private memberRowMap = new Map<string, number>();

    constructor(private storage: IStorageLayer, private groupId: string) { }

    private async touchGroup() {
        await this.storage.updateFile(this.groupId, { properties: { _lastSyncTrigger: new Date().toISOString() } });
    }

    async getMembers(): Promise<Member[]> {
        const res = await this.storage.batchGetValues(this.groupId, ["Members!A2:Z"]);
        const rows = res[0]?.values || [];
        return rows.map((r: any[], i: number) => {
            const mapped = SheetDataMapper.mapToMember(r, i + 2);
            this.memberRowMap.set(mapped.entity.userId, mapped.rowIndex);
            return mapped.entity;
        });
    }

    async getExpenses(): Promise<Expense[]> {
        const res = await this.storage.batchGetValues(this.groupId, ["Expenses!A2:Z"]);
        const rows = res[0]?.values || [];
        return rows.map((r: any[], i: number) => {
            const mapped = SheetDataMapper.mapToExpense(r, i + 2);
            this.expenseRowMap.set(mapped.entity.id, mapped.rowIndex);
            return mapped.entity;
        });
    }

    async getSettlements(): Promise<Settlement[]> {
        const res = await this.storage.batchGetValues(this.groupId, ["Settlements!A2:Z"]);
        const rows = res[0]?.values || [];
        return rows.map((r: any[], i: number) => {
            const mapped = SheetDataMapper.mapToSettlement(r, i + 2);
            this.settlementRowMap.set(mapped.entity.id, mapped.rowIndex);
            return mapped.entity;
        });
    }

    async addExpense(expense: Expense): Promise<void> {
        const row = SheetDataMapper.mapFromExpense(expense);
        await this.storage.appendValues(this.groupId, "Expenses!A1", [row]);
        await this.touchGroup();
    }

    async updateExpense(expense: Expense, expectedLastModified?: Date): Promise<void> {
        if (!this.expenseRowMap.has(expense.id)) {
            await this.getExpenses();
        }
        const rowIndex = this.expenseRowMap.get(expense.id);
        if (!rowIndex) throw new Error("Expense not found");

        const row = SheetDataMapper.mapFromExpense(expense);
        await this.storage.updateValues(this.groupId, `Expenses!A${rowIndex}:Z${rowIndex}`, [row]);
        await this.touchGroup();
    }

    async deleteExpense(expenseId: string): Promise<void> {
        if (!this.expenseRowMap.has(expenseId)) {
            await this.getExpenses();
        }
        const rowIndex = this.expenseRowMap.get(expenseId);
        if (!rowIndex) throw new Error("Expense not found");

        const sheetData = await this.storage.getSpreadsheet(this.groupId, "sheets.properties");
        const sheetId = sheetData.sheets.find((s: any) => s.properties.title === "Expenses")?.properties?.sheetId;
        if (sheetId === undefined) throw new Error("Sheet Expenses not found");

        await this.storage.batchUpdateSpreadsheet(this.groupId, [
            { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } }
        ]);
        await this.touchGroup();
    }
}
