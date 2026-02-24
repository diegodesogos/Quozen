import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function getToken() {
    const credsPath = path.join(os.homedir(), '.quozen', 'credentials.json');
    try {
        const data = await fs.readFile(credsPath, 'utf-8');
        return JSON.parse(data).access_token;
    } catch (e) {
        console.error("❌ Credentials not found! Run 'npm run cli -- login' from the root first.");
        process.exit(1);
    }
}

async function testApi() {
    const token = await getToken();
    const API_BASE = 'http://localhost:8787/api/v1';

    console.log("==========================================");
    console.log("🚀 QUOZEN API LIVE TESTER");
    console.log(`🔗 Target: ${API_BASE}`);
    console.log("==========================================");

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    try {
        // 1. Fetch Groups
        console.log("▶ GET /groups");
        const gRes = await fetch(`${API_BASE}/groups`, { headers });
        console.log(`  Status: ${gRes.status}`);

        if (!gRes.ok) {
            console.error(`  Error: ${await gRes.text()}`);
            return;
        }

        const groups = await gRes.json() as any[];
        console.log(`  Result: Found ${groups.length} groups.`);

        // 2. Fetch Ledger for the first group (if available)
        if (groups.length > 0) {
            const target = groups[0];
            console.log(`▶ GET /groups/${target.id}/ledger`);
            const lRes = await fetch(`${API_BASE}/groups/${target.id}/ledger`, { headers });
            console.log(`  Status: ${lRes.status}`);

            if (lRes.ok) {
                const ledger = await lRes.json();
                console.log(`  Result:`, ledger);
            } else {
                console.error(`  Error: ${await lRes.text()}`);
            }
        } else {
            console.log("ℹ️ No groups found. Skipping ledger test.");
        }

        console.log("==========================================");
        console.log("✅ Test sequence complete.");
        console.log("To manually test via Swagger UI (http://localhost:8787/api/docs), use this token:");
        console.log(`Bearer ${token}`);
        console.log("==========================================");

    } catch (error: any) {
        console.error("❌ Connection failed. Is the Wrangler server running on port 8787?");
        console.error(`   Run 'npm run dev:api' in another terminal.`);
        console.error(`   Details: ${error.message}`);
    }
}

testApi();
