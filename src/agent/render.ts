import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal());

export class TerminalRenderer {
  private text = "";
  private reasoning = "";
  private lastRender = 0;
  private renderedLines = 0;
  private readonly intervalMs = 100;

  constructor(private readonly showReasoning: boolean) {}

  appendText(delta: string): void {
    this.text += delta;
    this.maybeRender();
  }

  appendReasoning(delta: string): void {
    this.reasoning += delta;
    if (this.showReasoning) {
      this.maybeRender();
    }
  }

  toolStatus(message: string): void {
    this.clear();
    process.stderr.write(`${message}\n`);
    this.renderNow();
  }

  finish(): void {
    this.renderNow(true);
    process.stdout.write("\n");
  }

  private maybeRender(): void {
    if (!process.stdout.isTTY) {
      return;
    }
    const now = Date.now();
    if (now - this.lastRender >= this.intervalMs) {
      this.renderNow();
    }
  }

  private renderNow(force = false): void {
    if (!force && this.text.length === 0 && (!this.showReasoning || this.reasoning.length === 0)) {
      return;
    }
    this.clear();
    const output = this.renderMarkdown(this.document());
    process.stdout.write(output);
    if (!output.endsWith("\n")) {
      process.stdout.write("\n");
    }
    this.renderedLines = countLines(output);
    this.lastRender = Date.now();
  }

  private clear(): void {
    if (this.renderedLines === 0 || !process.stdout.isTTY) {
      return;
    }
    process.stdout.write(`\x1b[${this.renderedLines}A\x1b[J`);
    this.renderedLines = 0;
  }

  private document(): string {
    if (!this.showReasoning || this.reasoning.length === 0) {
      return this.text || "";
    }

    return `## 思考\n\n${this.reasoning.trim()}\n\n## 回答\n\n${this.text}`;
  }

  private renderMarkdown(value: string): string {
    try {
      return marked.parse(value, { async: false }) as string;
    } catch {
      return value;
    }
  }
}

function countLines(value: string): number {
  if (value.length === 0) {
    return 0;
  }
  return value.split("\n").length;
}
