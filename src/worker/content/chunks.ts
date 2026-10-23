import { marked } from "marked";

/** Keep Markdown blocks intact and attach separator whitespace to its block. */
export function splitMarkdown(body: string, budget: number): string[] {
  const blocks: string[] = [];
  let leading = "";
  for (const token of marked.lexer(body)) {
    if (token.raw.trim()) {
      blocks.push(leading + token.raw);
      leading = "";
    } else if (blocks.length) blocks[blocks.length - 1] += token.raw;
    else leading += token.raw;
  }
  if (!blocks.length) return body ? [body] : [];
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length > budget) {
      chunks.push(current);
      current = "";
    }
    current += block;
    if (current.length >= budget) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
