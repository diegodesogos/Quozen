import { describe, it, expect, vi } from "vitest";
import { QuozenClient, InMemoryAdapter } from "../src/index";
import { ValidationService, ValidationStatus } from "../src/schema/ValidationService";

vi.mock("../src/schema/ValidationService");

describe("Group Corruption Test", () => {
  it("should prevent importing a corrupted group if the fix is present", async () => {
    const storage = new InMemoryAdapter();
    
    storage.sheets.set("corrupted-group", {
      properties: { title: "corrupted-group" },
      data: [
        { properties: { title: "Expenses" }, rowData: [] },
        { properties: { title: "Settlements" }, rowData: [] },
        { properties: { title: "Members" }, rowData: [] }
      ]
    });
    
    // Simulate that it has the correct properties
    vi.spyOn(storage, "getFile").mockResolvedValue({
      name: "corrupted-group",
      properties: { quozen_type: 'group', version: '1.0' }
    });
    
    // Mock ValidationService checkHealth to simulate gdocs-schema detecting corruption
    vi.spyOn(ValidationService.prototype, "checkHealth").mockResolvedValue({
      spreadsheetId: "corrupted-group",
      currentVersion: 1,
      latestVersion: 1,
      status: ValidationStatus.CORRUPTED,
      missingTabs: [],
      missingColumns: { Expenses: ["amount"] },
      canAutoMigrate: false,
      lastModifiedTime: ""
    });

    const client = new QuozenClient({
      storage,
      user: { id: "1", username: "test", email: "test@example.com", name: "Test User" },
      getToken: () => "fake-token"
    });

    await client.groups.importGroup("corrupted-group");
    const settings = await client.groups.getSettings();
    
    // The group should not be active because it's corrupted
    expect(settings.activeGroupId).toBeNull();
  });
});
