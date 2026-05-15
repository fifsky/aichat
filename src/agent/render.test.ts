import { describe, expect, test } from "bun:test";
import { TerminalRenderer } from "./render";

describe("TerminalRenderer", () => {
  test("does not repeat full markdown output for tool events in non-TTY output", () => {
    const capture = captureProcessOutput({ isTTY: false });

    try {
      const renderer = new TerminalRenderer(true);

      renderer.appendReasoning("The user asked for weather.");
      renderer.toolStatus("[tool:bash] called");
      renderer.appendReasoning("\nThe command was denied.");
      renderer.toolStatus("[tool:bash] result received");
      renderer.appendText("Here is the answer.");
      renderer.finish();

      expect(capture.stdout()).not.toContain("## 思考");
      expect(capture.stdout()).not.toContain("## 回答");
      expect(countOccurrences(capture.stdout(), "The user asked for weather.")).toBe(1);
      expect(capture.stdout()).toContain("Here is the answer.");
      expect(capture.stderr()).toContain("[tool:bash] called");
      expect(capture.stderr()).toContain("[tool:bash] result received");
    } finally {
      capture.restore();
    }
  });

  test("does not use redraw output when TERM is dumb", () => {
    const capture = captureProcessOutput({ isTTY: true, term: "dumb" });

    try {
      const renderer = new TerminalRenderer(true);

      renderer.appendReasoning("The user asked for weather.");
      renderer.toolStatus("[tool:bash] called");
      renderer.appendReasoning("\nThe command was denied.");
      renderer.toolStatus("[tool:bash] result received");
      renderer.appendText("Here is the answer.");
      renderer.finish();

      expect(capture.stdout()).toContain("\x1b[90m");
      expect(capture.stdout()).not.toContain("\x1b[7A");
      expect(capture.stdout()).not.toContain("## 思考");
      expect(capture.stdout()).not.toContain("## 回答");
      expect(countOccurrences(capture.stdout(), "The user asked for weather.")).toBe(1);
      expect(capture.stdout()).toContain("Here is the answer.");
    } finally {
      capture.restore();
    }
  });

  test("prints reasoning in gray and answer normally in TTY output", () => {
    const capture = captureProcessOutput({ isTTY: true, term: "xterm-256color" });

    try {
      const renderer = new TerminalRenderer(true);

      renderer.appendReasoning("用户要求");
      renderer.appendReasoning("查询上海天气。");
      renderer.toolStatus("[tool:bash] called");
      renderer.appendText("上海今天");
      renderer.appendText("多云。");
      renderer.finish();

      expect(capture.stdout()).not.toContain("## 思考");
      expect(capture.stdout()).not.toContain("## 回答");
      expect(capture.stdout()).toContain("\x1b[90m用户要求\x1b[0m");
      expect(capture.stdout()).toContain("\x1b[90m查询上海天气。\x1b[0m");
      expect(capture.stdout()).toContain("\n\n上海今天多云。");
    } finally {
      capture.restore();
    }
  });
});

function captureProcessOutput(options: { isTTY: boolean; term?: string }): {
  stdout: () => string;
  stderr: () => string;
  restore: () => void;
} {
  let stdout = "";
  let stderr = "";
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const stdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  const term = process.env.TERM;

  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderr += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: options.isTTY,
  });
  if (options.term) {
    process.env.TERM = options.term;
  }

  return {
    stdout: () => stdout,
    stderr: () => stderr,
    restore: () => {
      process.stdout.write = stdoutWrite;
      process.stderr.write = stderrWrite;
      if (stdoutIsTTY) {
        Object.defineProperty(process.stdout, "isTTY", stdoutIsTTY);
      } else {
        delete (process.stdout as { isTTY?: boolean }).isTTY;
      }
      if (term == null) {
        delete process.env.TERM;
      } else {
        process.env.TERM = term;
      }
    },
  };
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}
