/**
 * Provider-independent AI usage records.
 *
 * A record distinguishes what the provider actually reported from what we could
 * only estimate, and from what is genuinely unknown. Estimates are never stored
 * as if they were provider-reported numbers.
 */

export type UsageSource = "provider_reported" | "estimated" | "unavailable";

export type UsageRequestStatus = "completed" | "interrupted" | "failed";

export type UsageRecord = {
  id: string;
  /** Identifier shared with the request lifecycle, for correlation. */
  requestId: string;
  providerId: string;
  modelId: string;
  conversationId: string | null;
  /** Null when the provider did not report the count. */
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageSource: UsageSource;
  durationMs: number;
  status: UsageRequestStatus;
  createdAt: string;
  /** Safe, user-facing failure summary. Never raw provider payloads. */
  errorCode?: string;
};

/**
 * Only provider-reported values populate `inputTokens`/`outputTokens`/
 * `totalTokens`. A provider that returns nothing yields `source: "unavailable"`
 * with null counts rather than fabricated numbers.
 */
export type NormalizedUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  source: "provider_reported" | "estimated";
};

export function isReportedUsage(usage: NormalizedUsage | undefined): boolean {
  return Boolean(usage && usage.source === "provider_reported");
}

/** Coerces adapter-supplied usage into the common shape, dropping invalid values. */
export function normalizeUsage(
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; source: NormalizedUsage["source"] } | undefined,
): NormalizedUsage | undefined {
  if (!usage) return undefined;
  const pick = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  const inputTokens = pick(usage.inputTokens);
  const outputTokens = pick(usage.outputTokens);
  const reportedTotal = pick(usage.totalTokens);
  const derivedTotal = inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined;
  const totalTokens = reportedTotal ?? derivedTotal;
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return {
    ...(inputTokens !== undefined && { inputTokens }),
    ...(outputTokens !== undefined && { outputTokens }),
    ...(totalTokens !== undefined && { totalTokens }),
    source: usage.source,
  };
}
