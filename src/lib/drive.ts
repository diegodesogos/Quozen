
import { storage } from "./storage";
import { SCHEMAS } from "./storage/types";

// Re-export for backward compatibility
export const googleApi = storage;
export { SCHEMAS };
export * from "./storage/types";
