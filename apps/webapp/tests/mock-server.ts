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

        // --- Files ---
        if (path === '/files') {
            if (method === 'POST') {
                const sheetNames = body.sheetNames || body.sheetTitles || [];
                const id = await this.adapter.createFile(body.name, sheetNames, body.properties, body.content);
                result = { id };
            } else if (method === 'GET') {
                const q = url.searchParams.get('q');
                result = { files: await this.adapter.listFiles(q || "") };
            }
        }
        else if (path.match(/\/files\/[^\/]+$/)) {
            // /files/:id
            const id = path.split('/')[2];
            if (method === 'DELETE') {
                await this.adapter.deleteFile(id);
                result = { success: true };
            } else if (method === 'PATCH') {
                if (body && (body.metadata || body.content)) {
                    result = await this.adapter.updateFile(id, body.metadata, body.content);
                } else {
                    await this.adapter.renameFile(id, body.name);
                    result = { success: true };
                }
            } else if (method === 'GET') {
                const optionsParam = url.searchParams.get('options');
                let options: any = {};
                if (optionsParam) try { options = JSON.parse(optionsParam); } catch { }
                result = await this.adapter.getFile(id, options);
            }
        }
        else if (path.match(/\/files\/[^\/]+\/permissions$/)) {
            const id = path.split('/')[2];
            if (method === 'GET') {
                result = { permissions: await this.adapter.listPermissions(id) };
            } else if (method === 'POST') {
                if (body.access) {
                    await this.adapter.setFilePermissions(id, body.access);
                    result = { success: true };
                } else {
                    result = await this.adapter.createPermission(id, body.role, body.type, body.emailAddress);
                }
            }
        }
        else if (path.match(/\/files\/[^\/]+\/modifiedTime$/)) {
            const id = path.split('/')[2];
            result = { modifiedTime: await this.adapter.getLastModified(id) };
        }
        // --- Low-Level Spreadsheets (IStorageLayer) ---
        else if (path === '/spreadsheets') {
            if (method === 'POST') {
                const id = await this.adapter.createSpreadsheet(body.title, body.sheetTitles, body.properties);
                result = { id };
            }
        }
        else if (path.match(/\/spreadsheets\/[^\/]+$/)) {
            const id = path.split('/')[2];
            if (method === 'GET') {
                const fields = url.searchParams.get('fields');
                result = await this.adapter.getSpreadsheet(id, fields || undefined);
            }
        }
        else if (path.match(/\/spreadsheets\/[^\/]+\/values:batchGet$/)) {
            const id = path.split('/')[2];
            const rangesParam = url.searchParams.get('ranges');
            const ranges = rangesParam ? JSON.parse(rangesParam) : [];
            const valueRanges = await this.adapter.batchGetValues(id, ranges);
            result = { valueRanges };
        }
        else if (path.match(/\/spreadsheets\/[^\/]+\/values:batchUpdate$/)) {
            const id = path.split('/')[2];
            await this.adapter.batchUpdateValues(id, body.data);
            result = { success: true };
        }
        else if (path.match(/\/spreadsheets\/[^\/]+\/values\/[^:]+:append$/)) {
            const id = path.split('/')[2];
            const range = decodeURIComponent(path.split('/')[4].replace(':append', ''));
            await this.adapter.appendValues(id, range, body.values);
            result = { success: true };
        }
        else if (path.match(/\/spreadsheets\/[^\/]+\/values\/[^\?]+$/) && method === 'PUT') {
            const id = path.split('/')[2];
            const range = decodeURIComponent(path.split('/')[4]);
            await this.adapter.updateValues(id, range, body.values);
            result = { success: true };
        }
        else if (path.match(/\/spreadsheets\/[^\/]+:batchUpdate$/)) {
            const id = path.split('/')[2];
            await this.adapter.batchUpdateSpreadsheet(id, body.requests);
            result = { success: true };
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
