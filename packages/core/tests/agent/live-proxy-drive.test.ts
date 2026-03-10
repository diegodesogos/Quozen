import { describe, it, expect, beforeAll } from 'vitest';
import { QuozenClient, GoogleDriveStorageLayer, QuozenAI, ProxyAiProvider } from '../../src';
import { getLocalCredentials, refreshLocalAccessToken } from '../utils/local-credentials';
import * as dotenv from 'dotenv';
import * as path from 'path';

const shouldRun = !process.env.CI && process.env.RUN_LOCAL_LLM_TESTS === 'true';

describe.runIf(shouldRun)('AI Goal: Infrastructure Pipeline (Edge Proxy + Google Drive)', () => {
    let client: QuozenClient;
    let ai: QuozenAI;
    let groupId: string;

    beforeAll(async () => {
        // Dynamically resolve based on whether we are running from root or workspace.
        const envPath = process.cwd().endsWith('core') ? path.resolve(process.cwd(), '../../.env') : path.resolve(process.cwd(), '.env');
        dotenv.config({ path: envPath });

        let creds = await getLocalCredentials();
        if (!creds) throw new Error("No local credentials found. Run CLI login first.");
        if (Date.now() >= creds.expiry_date - 60000) {
            creds = await refreshLocalAccessToken(creds);
        }

        const storage = new GoogleDriveStorageLayer(() => creds.access_token);
        client = new QuozenClient({ storage, user: creds.user });

        // Clean up leftover test groups from previous runs so we can leave the new one alive for inspection
        const settings = await client.groups.getSettings();
        const oldTestGroups = settings.groupCache.filter(g => g.name === "AI Infrastructure Test Group");
        for (const g of oldTestGroups) {
            try {
                await client.groups.deleteGroup(g.id);
            } catch (e: any) {
                console.warn(`[Cleanup] Failed to delete old test group ${g.id}: ${e.message}`);
            }
        }

        // Force 127.0.0.1 to avoid Node.js 20+ IPv6 localhost resolution mismatch with Wrangler
        const proxyUrl = (process.env.VITE_AI_PROXY_URL || 'http://127.0.0.1:8788').replace('localhost', '127.0.0.1');
        const provider = new ProxyAiProvider(proxyUrl, () => creds.access_token);
        ai = new QuozenAI(client, provider);

        // Setup test group with 2 offline members + the active user (3 total)
        const group = await client.groups.create("AI Infrastructure Test Group", [{ username: "bob" }, { username: "charlie" }]);
        groupId = group.id;
    });

    it('should successfully route via proxy, process math in core, and save to Drive', async () => {
        const result = await ai.executeCommand(
            "Agrega 100 de gastos en un restaurante a dividir entre todo el grupo",
            groupId,
            "es"
        );

        expect(result.success, `AI Command failed: ${result.message}`).toBe(true);

        const ledgerService = client.ledger(groupId);
        const ledger = await ledgerService.getLedger();

        expect(ledger.expenses).toHaveLength(1);
        expect(ledger.expenses[0].amount).toBe(100);
        expect(ledger.expenses[0].splits).toHaveLength(3); // User + bob + charlie
    }, 240000);
});
