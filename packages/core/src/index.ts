// 1. Core SDK Facade
export { QuozenClient, QuozenConfig } from "./QuozenClient";

// 2. Domain Models & DTOs
export * from "./domain";
export { Ledger } from "./domain/Ledger";

// 3. Configuration & Adapters (Required to instantiate QuozenClient)
export { IStorageLayer } from "./infrastructure/IStorageLayer";
export { GoogleDriveStorageLayer } from "./infrastructure/GoogleDriveStorageLayer";
export { InMemoryAdapter } from "./storage/memory-adapter"; // Legacy/Test
export { RemoteMockAdapter } from "./storage/remote-adapter"; // Legacy/Test

// 4. Shared Utilities & Errors
export { formatCurrency } from "./finance/format-currency";
export * from "./errors";
