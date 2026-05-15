import { describe, expect, test } from "bun:test";
import { askInputSchema } from "./ask";

describe("ask tool input", () => {
  test("allows one text question", () => {
    const parsed = askInputSchema.parse({
      question: "请补充需求背景",
      type: "text",
    });

    expect(parsed.required).toBe(true);
    expect(parsed.options).toEqual([]);
  });

  test("rejects choice questions without options", () => {
    expect(() =>
      askInputSchema.parse({
        question: "请选择输出格式",
        type: "single",
      }),
    ).toThrow();
  });

  test("keeps custom choice prompts within five displayed options", () => {
    expect(() =>
      askInputSchema.parse({
        question: "请选择要支持的平台",
        type: "multiple",
        allowCustom: true,
        options: [
          { value: "web" },
          { value: "ios" },
          { value: "android" },
          { value: "desktop" },
          { value: "api" },
        ],
      }),
    ).toThrow();
  });
});
