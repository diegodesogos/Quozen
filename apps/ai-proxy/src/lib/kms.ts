export async function encrypt(text: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    // Ensure secret is 32 bytes for AES-256
    const keyData = encoder.encode(secret.padEnd(32, '0').slice(0, 32));

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Using browser-compatible btoa for Edge compatibility
    return btoa(String.fromCharCode(...combined));
}

export async function decrypt(ciphertextBase64: string, secret: string): Promise<string> {
    const combined = new Uint8Array(
        atob(ciphertextBase64).split('').map(c => c.charCodeAt(0))
    );
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret.padEnd(32, '0').slice(0, 32));

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );

    return new TextDecoder().decode(decrypted);
}
