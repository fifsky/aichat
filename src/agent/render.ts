import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal());

export class TerminalRenderer {
  private text = "";
  private reasoning = "";
  private wroteReasoning = false;
  private wroteOutput = false;
  private separatedAnswer = false;
  private readonly markdown = new StreamingMarkdownRenderer((value) => this.write(value));

  constructor(private readonly showReasoning: boolean) {}

  appendText(delta: string): void {
    this.text += delta;
    if (delta.length === 0) {
      return;
    }
    if (this.wroteOutput && !this.separatedAnswer) {
      process.stdout.write("\n\n");
      this.separatedAnswer = true;
    }
    this.markdown.append(delta);
  }

  appendReasoning(delta: string): void {
    this.reasoning += delta;
    if (!this.showReasoning || delta.length === 0) {
      return;
    }

    this.writeReasoning(delta);
    this.wroteReasoning = true;
  }

  toolStatus(message: string): void {
    if (this.wroteOutput) {
      process.stderr.write("\n");
    }
    process.stderr.write(`${message}\n`);
  }

  finish(): void {
    this.markdown.finish();
    if (this.wroteOutput) {
      process.stdout.write("\n");
    }
  }

  private write(value: string): void {
    process.stdout.write(value);
    this.wroteOutput = true;
  }

  private writeReasoning(value: string): void {
    if (process.stdout.isTTY === true) {
      this.write(`\x1b[90m${value}\x1b[0m`);
      return;
    }
    this.write(value);
  }
}

class StreamingMarkdownRenderer {
  private buffer = "";
  hasOutput = false;

  constructor(private readonly write: (value: string) => void) {}

  append(delta: string): void {
    this.buffer += delta;
    this.flushCompleteBlocks();
  }

  finish(): void {
    this.flush(this.buffer);
    this.buffer = "";
  }

  private flushCompleteBlocks(): void {
    while (true) {
      const next = takeCompleteBlock(this.buffer);
      if (next == null) {
        return;
      }
      this.flush(next.block);
      this.buffer = next.rest;
    }
  }

  private flush(markdown: string): void {
    if (markdown.length === 0) {
      return;
    }
    const output = renderMarkdown(markdown);
    if (output.length === 0) {
      return;
    }
    this.write(output);
    this.hasOutput = true;
  }
}

type Line = {
  raw: string;
  text: string;
  ended: boolean;
};

function takeCompleteBlock(value: string): { block: string; rest: string } | null {
  const lines = splitLines(value);
  const first = lines[0];
  if (first == null || !first.ended) {
    return null;
  }

  if (isBlank(first.text)) {
    return { block: first.raw, rest: value.slice(first.raw.length) };
  }

  if (isFenceStart(first.text)) {
    return takeFenceBlock(value, lines, first.text);
  }

  if (lines.length >= 2 && first.ended && lines[1]?.ended && isTableHeader(first.text, lines[1].text)) {
    return takeTableBlock(value, lines);
  }

  if (isSingleLineBlock(first.text)) {
    return { block: first.raw, rest: value.slice(first.raw.length) };
  }

  const boundary = value.search(/\r?\n\s*\r?\n/);
  if (boundary !== -1) {
    const match = value.slice(boundary).match(/^\r?\n\s*\r?\n/);
    const end = boundary + (match?.[0].length ?? 0);
    return { block: value.slice(0, end), rest: value.slice(end) };
  }

  return null;
}

function takeFenceBlock(value: string, lines: Line[], fenceStart: string): { block: string; rest: string } | null {
  const marker = fenceStart.trimStart().startsWith("~~~") ? "~~~" : "```";
  let offset = lines[0]!.raw.length;
  for (const line of lines.slice(1)) {
    offset += line.raw.length;
    if (!line.ended) {
      return null;
    }
    if (line.text.trimStart().startsWith(marker)) {
      return { block: value.slice(0, offset), rest: value.slice(offset) };
    }
  }
  return null;
}

function takeTableBlock(value: string, lines: Line[]): { block: string; rest: string } | null {
  let offset = lines[0]!.raw.length + lines[1]!.raw.length;
  for (const line of lines.slice(2)) {
    if (!line.ended) {
      return null;
    }
    if (isBlank(line.text) || !line.text.includes("|")) {
      return { block: value.slice(0, offset), rest: value.slice(offset) };
    }
    offset += line.raw.length;
  }
  return null;
}

function splitLines(value: string): Line[] {
  const matches = value.match(/[^\n]*(?:\n|$)/g) ?? [];
  return matches
    .filter((raw, index) => raw.length > 0 || index < matches.length - 1)
    .map((raw) => ({
      raw,
      text: raw.endsWith("\n") ? raw.slice(0, -1).replace(/\r$/, "") : raw,
      ended: raw.endsWith("\n"),
    }));
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function isFenceStart(value: string): boolean {
  return /^\s*(```|~~~)/.test(value);
}

function isSingleLineBlock(value: string): boolean {
  return /^\s{0,3}#{1,6}\s+/.test(value) || /^\s{0,3}([-*_]\s*){3,}$/.test(value);
}

function isTableHeader(header: string, separator: string): boolean {
  return header.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator);
}

function renderMarkdown(value: string): string {
  try {
    return marked.parse(value, { async: false }) as string;
  } catch {
    return value;
  }
}
