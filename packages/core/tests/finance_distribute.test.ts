import { describe, it, expect } from "vitest";
import { distributeAmount } from "../src/finance";

describe("distributeAmount", () => {
  it("distributes amounts equally when possible", () => {
    // 10 / 2 = 5, 5
    const result = distributeAmount(10, 2);
    expect(result).toEqual([5, 5]);
  });

  it("handles penny distribution correctly (100 / 3)", () => {
    // 100 / 3 = 33.333... -> 33.34, 33.33, 33.33
    const result = distributeAmount(100, 3);

    // Check sum
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 2);

    // Check individual values
    expect(result).toContain(33.34);
    expect(result.filter(x => x === 33.33).length).toBe(2);
  });

  it("handles penny distribution correctly (10 / 3)", () => {
    const result = distributeAmount(10, 3);
    // 3.34, 3.33, 3.33
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(10, 2);
  });

  it("handles single person", () => {
    expect(distributeAmount(50, 1)).toEqual([50]);
  });

  it("handles zero amount", () => {
    expect(distributeAmount(0, 3)).toEqual([0, 0, 0]);
  });

  it("handles precision correctly with small float inputs", () => {
    // Input might be a float string parsed
    const result = distributeAmount(33.89, 3);
    // 33.89 / 3 = 11.2966...
    // Should be 11.30, 11.30, 11.29 (Sum 33.89)
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(33.89, 2);
    expect(result).toContain(11.30);
    expect(result).toContain(11.29);
  });
});
