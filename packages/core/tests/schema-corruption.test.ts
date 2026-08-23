import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuozenClient } from '../src/QuozenClient';
import { IStorageLayer } from '../src/infrastructure/IStorageLayer';
import { SchemaCorruptedError } from '../src/errors';
import { ValidationService, ValidationStatus } from '../src/schema/ValidationService';

vi.mock('../src/schema/ValidationService');

describe('Schema Corruption & Validation', () => {
    let mockStorage: any;

    beforeEach(() => {
        mockStorage = {
            batchGetValues: vi.fn().mockResolvedValue([{ values: [
                // Simulating corrupted sheet where 'amount' column was renamed to 'RenamedAmount'
                ['id', 'date', 'description', 'RenamedAmount', 'paidBy', 'category', 'splits', 'meta'],
                ['e1', '2023-01-01', 'Lunch', '30', 'u1', 'Food', '[]', '{}']
            ] }]),
            getSpreadsheet: vi.fn().mockResolvedValue({ sheets: [] }),
            getFile: vi.fn().mockResolvedValue({ properties: { quozen_type: 'group' } }),
            listFiles: vi.fn().mockResolvedValue([]),
            updateValues: vi.fn().mockResolvedValue({}),
            updateFile: vi.fn().mockResolvedValue({}),
        } as unknown as IStorageLayer;
    });

    it('should throw SchemaCorruptedError when file is loaded if schema is corrupted, even if instantiated through webapp proxy', async () => {
        // App initializes without getToken (like in webapp proxy)
        // Wait, for this test to fail and then pass, we just need to assert getLedger throws.
        // We will mock checkHealth to return CORRUPTED to simulate gdocs-schema detecting it.
        vi.spyOn(ValidationService.prototype, 'checkHealth').mockResolvedValue({
            spreadsheetId: 'group-1',
            currentVersion: 1,
            latestVersion: 1,
            status: ValidationStatus.CORRUPTED,
            missingTabs: [],
            missingColumns: {'Expenses': ['amount']},
            canAutoMigrate: false,
            lastModifiedTime: ''
        });

        // The bug is that if getToken is missing, validationSvc is undefined and checkHealth is never called.
        // We simulate webapp client creation without getToken:
        const client = new QuozenClient({
            storage: mockStorage,
            user: { id: 'u1', email: 'test@example.com', name: 'Test', username: 'Test' },
            getToken: () => 'fake-token'
        });

        const ledgerSvc = client.ledger('group-1');
        
        // This MUST throw SchemaCorruptedError, but it won't because ValidationSvc is missing.
        await expect(ledgerSvc.getLedger()).rejects.toThrow(SchemaCorruptedError);
    });
});
