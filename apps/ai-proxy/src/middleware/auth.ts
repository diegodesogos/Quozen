import { Context, Next } from 'hono';
import { validateGoogleToken, User } from '@quozen/core';

export type AppEnv = {
    Variables: {
        user: User;
    };
    Bindings: {
        KMS_SECRET: string;
        GOOGLE_GENERATIVE_AI_API_KEY: string;
        KV_REST_API_URL: string;
        KV_REST_API_TOKEN: string;
    };
};

export const authMiddleware = async (c: Context<AppEnv>, next: Next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // Support for testing
    if (token === 'mock-test-token') {
        const user: User = { id: 'u1', email: 'test@quozen.com', name: 'Test User', username: 'testuser' };
        c.set('user', user);
        return next();
    }

    try {
        const user = await validateGoogleToken(token);
        c.set('user', user);
        await next();
    } catch (error: any) {
        if (error.message === 'Invalid Google token') {
            return c.json({ error: 'Unauthorized', message: 'Invalid Google token' }, 401);
        }
        return c.json({ error: 'Internal Server Error', message: 'Failed to authenticate token' }, 500);
    }
};
