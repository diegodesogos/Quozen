import { z } from '@hono/zod-openapi';

export const MemberInputSchema = z.object({
    email: z.string().email().optional(),
    username: z.string().optional(),
}).openapi('MemberInput');

export const CreateGroupDTOSchema = z.object({
    name: z.string().openapi({ example: 'Trip to Paris' }),
    members: z.array(MemberInputSchema).optional(),
}).openapi('CreateGroupRequest');

export const UpdateGroupDTOSchema = z.object({
    name: z.string().optional().openapi({ example: 'Trip to Paris 2024' }),
    members: z.array(MemberInputSchema).optional(),
}).openapi('UpdateGroupRequest');

export const GroupSchema = z.object({
    id: z.string().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
    name: z.string().openapi({ example: 'Trip to Paris' }),
    description: z.string().openapi({ example: 'Google Sheet Group' }),
    createdBy: z.string().openapi({ example: 'me' }),
    participants: z.array(z.string()).openapi({ example: ['user1', 'user2'] }),
    createdAt: z.union([z.string(), z.date()]).openapi({ example: '2023-10-15T18:00:00Z' }),
    isOwner: z.boolean().openapi({ example: true }),
}).openapi('Group');

export const ExpenseSplitSchema = z.object({
    userId: z.string().openapi({ example: 'user-id-1' }),
    amount: z.number().openapi({ example: 25 }),
}).openapi('ExpenseSplit');

export const ExpenseSchema = z.object({
    id: z.string().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
    description: z.string().openapi({ example: 'Dinner at Mario\'s' }),
    amount: z.number().openapi({ example: 50 }),
    category: z.string().openapi({ example: 'Food & Dining' }),
    date: z.union([z.string(), z.date()]).openapi({ example: '2023-10-15T18:00:00Z' }),
    paidByUserId: z.string().openapi({ example: 'user-id-1' }),
    splits: z.array(ExpenseSplitSchema),
    createdAt: z.union([z.string(), z.date()]).openapi({ example: '2023-10-15T18:00:00Z' }),
    updatedAt: z.union([z.string(), z.date()]).openapi({ example: '2023-10-15T18:00:00Z' }),
}).openapi('Expense');

export const CreateExpenseDTOSchema = z.object({
    description: z.string().openapi({ example: 'Dinner at Mario\'s' }),
    amount: z.number().openapi({ example: 50 }),
    category: z.string().openapi({ example: 'Food & Dining' }),
    date: z.string().openapi({ example: '2023-10-15T18:00:00Z' }),
    paidByUserId: z.string().openapi({ example: 'user-id-1' }),
    splits: z.array(ExpenseSplitSchema),
}).openapi('CreateExpenseRequest');

export const UpdateExpenseDTOSchema = CreateExpenseDTOSchema.partial().extend({
    expectedLastModified: z.string().datetime().optional()
}).openapi('UpdateExpenseRequest');

export const SettlementSchema = z.object({
    id: z.string().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
    date: z.union([z.string(), z.date()]).openapi({ example: '2023-10-15T18:00:00Z' }),
    fromUserId: z.string().openapi({ example: 'user-id-1' }),
    toUserId: z.string().openapi({ example: 'user-id-2' }),
    amount: z.number().openapi({ example: 25 }),
    method: z.string().openapi({ example: 'cash' }),
    notes: z.string().optional().openapi({ example: 'Thanks for dinner!' }),
}).openapi('Settlement');

export const CreateSettlementDTOSchema = z.object({
    date: z.string().optional().openapi({ example: '2023-10-15T18:00:00Z' }),
    fromUserId: z.string().openapi({ example: 'user-id-1' }),
    toUserId: z.string().openapi({ example: 'user-id-2' }),
    amount: z.number().openapi({ example: 25 }),
    method: z.string().optional().openapi({ example: 'cash' }),
    notes: z.string().optional().openapi({ example: 'Thanks for dinner!' }),
}).openapi('CreateSettlementRequest');

export const UpdateSettlementDTOSchema = CreateSettlementDTOSchema.partial().openapi('UpdateSettlementRequest');

export const ErrorSchema = z.object({
    error: z.string(),
    message: z.string()
}).openapi('ErrorResponse');

export const SuccessSchema = z.object({
    success: z.boolean()
}).openapi('SuccessResponse');

export const LedgerAnalyticsSchema = z.object({
    balances: z.record(z.number()),
    totalVolume: z.number(),
    expenseCount: z.number(),
    settlementCount: z.number(),
    memberCount: z.number(),
    isBalanced: z.boolean(),
}).openapi('LedgerAnalytics');
