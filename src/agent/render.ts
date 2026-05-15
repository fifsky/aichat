export class TerminalRenderer {
  private text = "";
  private reasoning = "";
  private wroteReasoning = false;
  private wroteAnswer = false;
  private wroteOutput = false;

  constructor(private readonly showReasoning: boolean) {}

  appendText(delta: string): void {
    this.text += delta;
    if (delta.length === 0) {
      return;
    }

    if (!this.wroteAnswer) {
      if (this.showReasoning && this.wroteReasoning) {
        this.write("\n\n");
      }
      this.wroteAnswer = true;
    }
    this.write(delta);
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
