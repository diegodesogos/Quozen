import { AgentClient } from "@quozen/core";
import { getAuthToken } from "./tokenStore";

const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL || (import.meta.env.DEV ? 'http://localhost:8788' : '/api');

export const agentClient = new AgentClient(
    PROXY_URL,
    getAuthToken
);
