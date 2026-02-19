import { Route, Request } from '@playwright/test';
import { InMemoryAdapter } from '@quozen/core';

// Polyfill self.crypto for Node environment if needed
if (typeof self === 'undefined') {
    (global as any).self = global;
}
if (!global.crypto) {
    (global as any).crypto = require('crypto');
}

class MockServer {
    private adapter: InMemoryAdapter;

    constructor() {
        this.adapter = new InMemoryAdapter();
    }

    reset() {
        this.adapter = new InMemoryAdapter();
    }

    async handle(route: Route) {
        const request = route.request();
        const body = request.postDataJSON();

        try {
            const response = await this.dispatch(request.method(), request.url(), body);
            await route.fulfill({
                status: response.status,
                contentType: 'application/json',
                body: JSON.stringify(response.body)
            });
        } catch (e: any) {
            console.error("Mock Server Route Error:", e);
            await route.fulfill({ status: 500, body: e.message });
        }
    }

    async dispatch(method: string, urlStr: string, body: any): Promise<{ status: number, body: any }> {
        const url = new URL(urlStr, 'http://localhost'); // Ensure base if relative
        const path = url.pathname.replace('/_test/storage', '');

        let result: any;

        // --- Settings ---
        if (path.startsWith('/settings')) {
            if (method === 'GET') {
                const email = url.searchParams.get('email');
                if (email) result = { settings: await this.adapter.loadSettings(email) };
            } else if (method === 'POST') {
                await this.adapter.saveSettings(body.email, body.settings);
                result = { success: true };
            }
        }
        // --- Files ---
        else if (path === '/files') {
            if (method === 'POST') {
                const id = await this.adapter.createFile(body.name, body.sheetNames, body.properties);
                result = { id };
            } else if (method === 'GET') {
                // Support legacy query param 'q' or new 'options' JSON param
                const q = url.searchParams.get('q');
                const optionsParam = url.searchParams.get('options');

                let options: any = {};
                if (optionsParam) {
                    try { options = JSON.parse(optionsParam); } catch { }
                } else if (q) {
                    // Extract name from q string: name = 'X' or name contains 'X'
                    const matchExact = q.match(/name\s*=\s*'([^']+)'/);
                    const matchContains = q.match(/name\s*contains\s*'([^']+)'/);

                    if (matchExact) {
                        // For exact match, we pass it as nameContains for now as InMemoryAdapter uses includes, 
                        // but since the name is specific (like quozen-settings.json), includes is usually fine.
                        // Ideally InMemoryAdapter should support exact match, but this unblocks the test.
                        options = { nameContains: matchExact[1] };
                    } else if (matchContains) {
                        options = { nameContains: matchContains[1] };
                    }
                }

                result = { files: await this.adapter.listFiles(options) };
            }
        }
        else if (path.match(/\/files\/[^\/]+$/)) {
            // /files/:id
            const id = path.split('/')[2];
            if (method === 'DELETE') {
                await this.adapter.deleteFile(id);
                result = { success: true };
            } else if (method === 'PATCH') {
                await this.adapter.renameFile(id, body.name);
                result = { success: true };
            }
        }
        else if (path.match(/\/files\/[^\/]+\/share$/)) {
            const id = path.split('/')[2];
            const displayName = await this.adapter.shareFile(id, body.email, body.role);
            result = { displayName };
        }
        else if (path.match(/\/files\/[^\/]+\/permissions$/)) {
            const id = path.split('/')[2];
            if (method === 'GET') {
                const access = await this.adapter.getFilePermissions(id);
                result = { access };
            } else if (method === 'POST') {
                await this.adapter.setFilePermissions(id, body.access);
                result = { success: true };
            }
        }
        else if (path.match(/\/files\/[^\/]+\/properties$/)) {
            const id = path.split('/')[2];
            if (method === 'POST') {
                await this.adapter.addFileProperties(id, body.properties);
                result = { success: true };
            }
        }
        else if (path.match(/\/files\/[^\/]+\/meta$/)) {
            const id = path.split('/')[2];
            result = await this.adapter.getFileMeta(id);
        }
        else if (path.match(/\/files\/[^\/]+\/data$/)) {
            const id = path.split('/')[2];
            result = { data: await this.adapter.readGroupData(id) };
        }
        else if (path.match(/\/files\/[^\/]+\/initialize$/)) {
            const id = path.split('/')[2];
            await this.adapter.initializeGroup(id, body);
            result = { success: true };
        }
        else if (path.match(/\/files\/[^\/]+\/modifiedTime$/)) {
            const id = path.split('/')[2];
            result = { modifiedTime: await this.adapter.getLastModified(id) };
        }
        // --- Rows ---
        else if (path.match(/\/files\/[^\/]+\/rows\/[^\/]+$/)) {
            // /files/:id/rows/:sheetName
            const parts = path.split('/');
            const id = parts[2];
            const sheetName = parts[4] as any;
            if (method === 'POST') {
                await this.adapter.appendRow(id, sheetName, body);
                result = { success: true };
            }
        }
        else if (path.match(/\/files\/[^\/]+\/rows\/[^\/]+\/\d+$/)) {
            // /files/:id/rows/:sheetName/:rowIndex
            const parts = path.split('/');
            const id = parts[2];
            const sheetName = parts[4] as any;
            const rowIndex = parseInt(parts[5]);

            if (method === 'PUT') {
                await this.adapter.updateRow(id, sheetName, rowIndex, body);
                result = { success: true };
            } else if (method === 'DELETE') {
                await this.adapter.deleteRow(id, sheetName, rowIndex);
                result = { success: true };
            } else if (method === 'GET') {
                result = { row: await this.adapter.readRow(id, sheetName, rowIndex) };
            }
        }

        if (result !== undefined) {
            return { status: 200, body: result };
        } else if (path === '/reset' && method === 'POST') {
            this.reset();
            return { status: 200, body: { success: true } };
        } else {
            return { status: 404, body: 'Not Found' };
        }
    }
}

export const mockServer = new MockServer();
