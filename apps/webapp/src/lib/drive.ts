
import { storage } from "./storage";
import { SCHEMAS } from "@quozen/core";

// Re-export for backward compatibility
export const googleApi = storage;
export { SCHEMAS };
export * from "@quozen/core";
