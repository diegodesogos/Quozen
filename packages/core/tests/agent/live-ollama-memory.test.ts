import { describe, it, expect } from 'vitest';
import { QuozenAI } from '../../src/agent/QuozenAI';
import { LocalOllamaProvider } from '../../src/agent/providers/LocalOllamaProvider';
import { QuozenClient } from '../../src/QuozenClient';
import { InMemoryAdapter } from '../../src/storage/memory-adapter';
import * as dotenv from 'dotenv';
import * as path from 'path';

// This completely skips the suite in CI environments (GitHub Actions, Vercel) 
// or if the developer hasn't explicitly opted in.
const shouldRun = !process.env.CI && process.env.RUN_LOCAL_LLM_TESTS === 'true';

describe.runIf(shouldRun)('AI Goal: Intelligence Validation (Ollama + InMemory)', () => {
    it('should correctly instruct the LLM to extract intent without hallucinating math', async () => {
        // Load the AI proxy dev vars to get the actual model you downloaded
        const envPath = process.cwd().endsWith('core') ? path.resolve(process.cwd(), '../../apps/ai-proxy/.dev.vars') : path.resolve(process.cwd(), 'apps/ai-proxy/.dev.vars');
        dotenv.config({ path: envPath });

        // Setup local provider and facade
        const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/api').replace('localhost', '127.0.0.1');
        const model = process.env.OLLAMA_AI_MODEL || 'qwen3:0.6b';
        const provider = new LocalOllamaProvider(baseUrl, model);

        // Ensure Ollama is actually running before proceeding
        const isAvailable = await provider.checkAvailability();
        if (!isAvailable) {
            console.warn('Ollama not running, skipping live test');
            return;
        }

        const client = new QuozenClient({
            storage: new InMemoryAdapter(),
            user: { id: 'u1', name: 'Alice', username: 'alice', email: 'alice@example.com' }
        });

        // Initialize group
        const group = await client.groups.create('Test Group');
        const groupId = group.id;

        const ai = new QuozenAI(client, provider);
        const prompt = "I paid $25.50 for Pizza, split with Bob (id: u2)";

        const result = await ai.executeCommand(prompt, groupId, 'en');

        console.log('AI Logic Validation Result:', result);
        expect(result.success, `Local LLM Execution Failed: ${result.message}`).toBe(true);
    }, 240000);
});
