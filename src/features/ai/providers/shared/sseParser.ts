/**
 * Incremental Server-Sent Events parser for OpenAI-style streams.
 *
 * OpenAI streams one JSON payload per `data:` line, but a single network read
 * can contain several events, an event can be split across reads, and a
 * multi-byte UTF-8 character can be split mid-read. `TextDecoder` with
 * `{ stream: true }` handles the character boundary; this parser handles event
 * boundaries, CRLF/LF/CR line endings, comment lines, and the final event that
 * arrives without a trailing blank line.
 *
 * Gemini's adapter keeps its own line parser: its stream is a sequence of
 * independent JSON documents where every line is complete, so the two formats
 * are intentionally not merged.
 */
export class SseParser {
  private readonly decoder = new TextDecoder();
  private buffer = "";
  private dataLines: string[] = [];
  private finished = false;

  /**
   * Feeds a network chunk (or the final flush when `done` is true) and returns
   * the data payloads of every complete event. Multi-line `data:` fields are
   * joined with `\n`, as the SSE specification requires.
   */
  push(chunk?: Uint8Array, done = false): string[] {
    if (this.finished) return [];
    if (chunk) this.buffer += this.decoder.decode(chunk, { stream: !done });
    if (done) this.buffer += this.decoder.decode();

    const events: string[] = [];
    let line = this.readLine(done);
    while (line !== null) {
      if (line === "") {
        this.flushEvent(events);
      } else if (line.startsWith("data:")) {
        this.dataLines.push(line.slice(5).replace(/^ /, ""));
      }
      // `event:`, `id:`, `retry:` and comment lines carry nothing we use.
      line = this.readLine(done);
    }

    if (done) {
      this.flushEvent(events);
      this.finished = true;
    }
    return events;
  }

  private readLine(done: boolean): string | null {
    const buffer = this.buffer;
    for (let index = 0; index < buffer.length; index += 1) {
      const character = buffer[index];
      if (character === "\n") {
        const line = buffer.slice(0, index);
        this.buffer = buffer.slice(index + 1);
        return line.endsWith("\r") ? line.slice(0, -1) : line;
      }
      if (character === "\r") {
        // A trailing CR may be the first half of a CRLF split across reads.
        if (index + 1 >= buffer.length && !done) return null;
        const line = buffer.slice(0, index);
        this.buffer = buffer.slice(index + (buffer[index + 1] === "\n" ? 2 : 1));
        return line;
      }
    }
    if (done && buffer.length > 0) {
      this.buffer = "";
      return buffer;
    }
    return null;
  }

  private flushEvent(events: string[]): void {
    if (this.dataLines.length === 0) return;
    events.push(this.dataLines.join("\n"));
    this.dataLines = [];
  }
}
