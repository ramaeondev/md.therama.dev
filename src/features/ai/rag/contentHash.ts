/** SHA-256 content hashes are stable across reloads and browser sessions. */
export async function contentHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function deterministicId(...parts: string[]): string {
  // FNV-1a is used only to form a compact deterministic record key. Integrity
  // and change detection use the SHA-256 hash above.
  let hash = 0x811c9dc5;
  const input = parts.join("\u0000");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
