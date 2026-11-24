/**
 * Capability classification for dynamically discovered model IDs.
 *
 * Model discovery only returns identifiers; it never says whether a model
 * accepts chat completions. This catalogue classifies an ID into one of three
 * honest outcomes:
 *
 * - `chat`        a known chat-completions family,
 * - `unknown`     not recognised, so the UI must not claim chat support,
 * - `unsupported` a known non-chat model (embeddings, audio, images, …).
 *
 * No context-window, pricing, or token-limit values are invented here: those
 * are only ever taken from a provider response.
 */

export type ModelClassification = "chat" | "unknown" | "unsupported";

const NON_CHAT_PATTERNS: readonly RegExp[] = [
  /embedding/i,
  // Catches abbreviated IDs such as `deepseek-embed` and `bge-embed-v2`.
  /(^|[-_/])embed([-_/]|$)/i,
  /^text-embedding/i,
  /whisper/i,
  /transcribe/i,
  /(^|[-_/])tts([-_/]|$)/i,
  /dall-e/i,
  /^gpt-image/i,
  /(^|[-_/])image([-_/]|$)/i,
  /imagen/i,
  /moderation/i,
  /(^|[-_/])audio([-_/]|$)/i,
  /realtime/i,
  /rerank/i,
  /(^|[-_/])search([-_/]|$)/i,
  /computer-use/i,
  /^sora/i,
  /^babbage/i,
  /^davinci/i,
  /codex/i,
  /(^|[-_/])davinci([-_/]|$)/i,
];

const CHAT_PATTERNS: readonly RegExp[] = [
  /^gpt-/i,
  /^chatgpt-/i,
  /^o\d/i,
  /^deepseek/i,
  /^llama/i,
  /^mistral/i,
  /^mixtral/i,
  /^qwen/i,
  /^gemma/i,
  /^phi-/i,
  /^glm/i,
  /^kimi/i,
  /^moonshot/i,
  /^claude/i,
  /^command-/i,
  /^grok/i,
  /^yi-/i,
  /^internlm/i,
  /^ernie/i,
  /^nova-/i,
  /^titan/i,
  /^gpt-oss/i,
];

export function classifyModelId(modelId: string): ModelClassification {
  const id = modelId.trim();
  if (!id) return "unsupported";
  // Vendor-prefixed IDs such as `meta-llama/llama-3.3-70b` are classified on both
  // the full ID and the final path segment.
  const candidates = id.includes("/") ? [id, id.slice(id.lastIndexOf("/") + 1)] : [id];
  const matches = (patterns: readonly RegExp[]) =>
    candidates.some((candidate) => patterns.some((pattern) => pattern.test(candidate)));

  if (matches(NON_CHAT_PATTERNS)) return "unsupported";
  if (matches(CHAT_PATTERNS)) return "chat";
  return "unknown";
}

export function isChatCapableModelId(modelId: string): boolean {
  return classifyModelId(modelId) === "chat";
}

/** Readable label derived from the ID alone; no metadata is claimed. */
export function prettifyModelId(modelId: string): string {
  const id = modelId.trim();
  const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return (
    tail
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b[a-z]/g, (character) => character.toUpperCase()) || id
  );
}

/**
 * Reasoning-first models reject sampling parameters such as `temperature` and
 * `max_tokens`. Requests stay conservative: optional parameters are only sent
 * when the caller supplied them and the model is known to accept them.
 */
export function supportsSamplingParameters(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (/^o\d/.test(id)) return false;
  if (/reasoning|thinking/.test(id)) return false;
  if (/^gpt-5[-.]?pro/.test(id)) return false;
  return true;
}
