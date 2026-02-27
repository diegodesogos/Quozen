import { User } from '../domain/models';

/**
 * Validates a Google OAuth2 token by calling the Google userinfo endpoint.
 * This works in both browser and edge environments where 'fetch' is available.
 */
export async function validateGoogleToken(token: string): Promise<User> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        throw new Error('Invalid Google token');
    }

    const data = await response.json() as any;

    return {
        id: data.sub || data.id,
        email: data.email,
        name: data.name,
        username: data.email ? data.email.split('@')[0] : 'user',
        picture: data.picture
    };
}
