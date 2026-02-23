import { Context, Next } from 'hono';
import { QuozenClient, GoogleDriveStorageLayer, InMemoryAdapter } from '@quozen/core';

export type AuthUser = {
    id: string;
    email: string;
    name: string;
    username: string;
    picture?: string;
};

// Strongly type our Hono Context so handlers know about injected variables
export type AppEnv = {
    Variables: {
        user: AuthUser;
        quozen: QuozenClient;
    };
};

// Persist memory adapter across test requests
const testStorage = new InMemoryAdapter();

export const authMiddleware = async (c: Context<AppEnv>, next: Next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // Phase 6 Readiness: Support for Vitest isolated testing
    if (token === 'mock-test-token') {
        const user = { id: 'u1', email: 'test@quozen.com', name: 'Test User', username: 'testuser' };
        c.set('user', user);
        c.set('quozen', new QuozenClient({ storage: testStorage, user }));
        return next();
    }

    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            return c.json({ error: 'Unauthorized', message: 'Invalid Google token' }, 401);
        }

        const data = await response.json() as any;
        const user: AuthUser = {
            id: data.sub || data.id,
            email: data.email,
            name: data.name,
            username: data.email ? data.email.split('@')[0] : 'user',
            picture: data.picture
        };

        const storage = new GoogleDriveStorageLayer(() => token);
        const client = new QuozenClient({ storage, user });

        c.set('user', user);
        c.set('quozen', client);

        await next();
    } catch (error) {
        return c.json({ error: 'Internal Server Error', message: 'Failed to authenticate token' }, 500);
    }
};
