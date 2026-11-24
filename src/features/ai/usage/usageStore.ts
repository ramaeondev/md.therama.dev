import { indexedDbUsageStorage, type UsageStorageAdapter } from "./usageStorage";
import {
  normalizeUsage,
  type NormalizedUsage,
  type UsageRecord,
  type UsageRequestStatus,
  type UsageSource,
} from "./types";

import type { ProviderUsage } from "../providers/types";

function storage(): UsageStorageAdapter {
  return indexedDbUsageStorage;
}

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export type StartUsageRequestInput = {
  providerId: string;
  modelId: string;
  conversationId?: string | null;
  /** Injectable for tests; defaults to a new UUID. */
  requestId?: string;
  now?: string;
};

export type UsageRequestHandle = {
  readonly requestId: string;
  /** Records a completed request. Usage is only stored when the provider reported it. */
  complete(usage?: ProviderUsage | NormalizedUsage): Promise<UsageRecord>;
  /** Records a user-stopped or session-ended request. Never counted as completed. */
  interrupt(): Promise<UsageRecord>;
  /** Records a failed request. */
  fail(errorCode?: string): Promise<UsageRecord>;
  /** True once a terminal state has been recorded. */
  readonly settled: boolean;
};

/**
 * Starts a request lifecycle. Exactly one terminal state is recorded: a handle
 * that was already settled is a no-op, so an abort racing a failure cannot
 * double-count a request.
 */
export function startUsageRequest(input: StartUsageRequestInput): UsageRequestHandle {
  const requestId = input.requestId ?? crypto.randomUUID();
  const startedAt = monotonicNow();
  const createdAt = input.now ?? new Date().toISOString();
  let settledRecord: UsageRecord | null = null;

  async function record(status: UsageRequestStatus, usage: ProviderUsage | NormalizedUsage | undefined, errorCode?: string) {
    // Exactly one terminal state per request: an abort racing a failure, or a
    // retry settling twice, must never double-count.
    if (settledRecord) return settledRecord;
    const normalized = normalizeUsage(usage);
    const usageMetadata = usageFields(normalized);
    const entry: UsageRecord = {
      id: crypto.randomUUID(),
      requestId,
      providerId: input.providerId,
      modelId: input.modelId,
      conversationId: input.conversationId ?? null,
      ...usageMetadata,
      durationMs: Math.max(0, Math.round(monotonicNow() - startedAt)),
      status,
      createdAt,
      ...(errorCode ? { errorCode } : {}),
    };
    settledRecord = entry;
    await storage().save(entry);
    return entry;
  }

  return {
    requestId,
    get settled() {
      return settledRecord !== null;
    },
    complete: (usage) => record("completed", usage),
    interrupt: () => record("interrupted", undefined),
    fail: (errorCode) => record("failed", undefined, errorCode),
  };
}

function usageFields(usage: NormalizedUsage | undefined): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageSource: UsageSource;
} {
  if (!usage) {
    return { inputTokens: null, outputTokens: null, totalTokens: null, usageSource: "unavailable" };
  }
  return {
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
    usageSource: usage.source,
  };
}

export async function listUsageRecords(): Promise<UsageRecord[]> {
  const records = await storage().list();
  // Newest first. The id tiebreaker keeps ordering stable when two records share
  // a millisecond timestamp.
  return records.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export async function clearUsageRecords(): Promise<void> {
  await storage().clear();
}

export type UsageBreakdown = {
  key: string;
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reportedRequests: number;
  unavailableRequests: number;
  failedRequests: number;
  interruptedRequests: number;
};

export type UsageSummary = {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  interruptedRequests: number;
  /** Sum over provider-reported records only. */
  reportedInputTokens: number;
  reportedOutputTokens: number;
  reportedTotalTokens: number;
  /** Requests where the provider returned no usage metadata. */
  unavailableRequests: number;
  byProvider: UsageBreakdown[];
  byModel: UsageBreakdown[];
  recent: UsageRecord[];
};

const recentLimit = 10;

export function summarizeUsage(records: UsageRecord[]): UsageSummary {
  const byProvider = new Map<string, UsageBreakdown>();
  const byModel = new Map<string, UsageBreakdown>();
  let reportedInputTokens = 0;
  let reportedOutputTokens = 0;
  let reportedTotalTokens = 0;
  let completedRequests = 0;
  let failedRequests = 0;
  let interruptedRequests = 0;
  let unavailableRequests = 0;

  for (const record of records) {
    if (record.status === "completed") completedRequests += 1;
    if (record.status === "failed") failedRequests += 1;
    if (record.status === "interrupted") interruptedRequests += 1;
    if (record.usageSource === "unavailable") unavailableRequests += 1;

    const reported = record.usageSource === "provider_reported";
    if (reported) {
      reportedInputTokens += record.inputTokens ?? 0;
      reportedOutputTokens += record.outputTokens ?? 0;
      reportedTotalTokens += record.totalTokens ?? 0;
    }

    accumulate(byProvider, record.providerId, record.providerId, record, reported);
    accumulate(byModel, record.modelId, record.modelId, record, reported);
  }

  return {
    totalRequests: records.length,
    completedRequests,
    failedRequests,
    interruptedRequests,
    reportedInputTokens,
    reportedOutputTokens,
    reportedTotalTokens,
    unavailableRequests,
    byProvider: sortBreakdown([...byProvider.values()]),
    byModel: sortBreakdown([...byModel.values()]),
    recent: records.slice(0, recentLimit),
  };
}

function accumulate(
  groups: Map<string, UsageBreakdown>,
  key: string,
  label: string,
  record: UsageRecord,
  reported: boolean,
): void {
  const entry = groups.get(key) ?? {
    key,
    label,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reportedRequests: 0,
    unavailableRequests: 0,
    failedRequests: 0,
    interruptedRequests: 0,
  };
  entry.requests += 1;
  if (record.status === "failed") entry.failedRequests += 1;
  if (record.status === "interrupted") entry.interruptedRequests += 1;
  if (reported) {
    entry.reportedRequests += 1;
    entry.inputTokens += record.inputTokens ?? 0;
    entry.outputTokens += record.outputTokens ?? 0;
    entry.totalTokens += record.totalTokens ?? 0;
  } else if (record.usageSource === "unavailable") {
    entry.unavailableRequests += 1;
  }
  groups.set(key, entry);
}

function sortBreakdown(entries: UsageBreakdown[]): UsageBreakdown[] {
  return entries.sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));
}
