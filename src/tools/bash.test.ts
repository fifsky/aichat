import { describe, expect, test } from "bun:test";
import { isConfirmedAnswer } from "./bash";

describe("bash tool confirmation", () => {
  test("defaults empty confirmation to yes", () => {
    expect(isConfirmedAnswer("")).toBe(true);
    expect(isConfirmedAnswer("   ")).toBe(true);
    expect(isConfirmedAnswer("y")).toBe(true);
    expect(isConfirmedAnswer("yes")).toBe(true);
    expect(isConfirmedAnswer("n")).toBe(false);
    expect(isConfirmedAnswer("no")).toBe(false);
  });
});
