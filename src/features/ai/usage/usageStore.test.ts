import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { deleteAppDatabase, resetAppDatabaseConnection } from "@/lib/indexedDb";

import { estimateRequestTokens, estimateTokens } from "./estimate";
import { clearUsageRecords, listUsageRecords, startUsageRequest, summarizeUsage } from "./usageStore";
import { normalizeUsage } from "./types";

const reported = { inputTokens: 120, outputTokens: 45, totalTokens: 165, source: "provider_reported" as const };

describe("AI usage tracking", () => {
  beforeEach(async () => {
    resetAppDatabaseConnection();
    await deleteAppDatabase();
  });

  it("records provider-reported token usage for a completed request", async () => {
    const handle = startUsageRequest({ providerId: "gemini", modelId: "gemini-test", conversationId: "conversation-1" });
    const record = await handle.complete(reported);

    expect(record).toMatchObject({
      providerId: "gemini",
      modelId: "gemini-test",
      conversationId: "conversation-1",
      inputTokens: 120,
      outputTokens: 45,
      totalTokens: 165,
      usageSource: "provider_reported",
      status: "completed",
    });
    expect(record.requestId).toBe(handle.requestId);
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(record.createdAt).toBeTruthy();

    resetAppDatabaseConnection();
    expect(await listUsageRecords()).toHaveLength(1);
  });

  it("marks usage unavailable instead of inventing token counts", async () => {
    const handle = startUsageRequest({ providerId: "gemini", modelId: "gemini-test" });
    const record = await handle.complete(undefined);

    expect(record.usageSource).toBe("unavailable");
    expect(record.inputTokens).toBeNull();
    expect(record.outputTokens).toBeNull();
    expect(record.totalTokens).toBeNull();
    expect(record.status).toBe("completed");
  });

  it("never reports estimated counts as provider-reported", async () => {
    const handle = startUsageRequest({ providerId: "gemini", modelId: "gemini-test" });
    const record = await handle.complete({ inputTokens: 10, outputTokens: 5, totalTokens: 15, source: "estimated" });

    expect(record.usageSource).toBe("estimated");
    const summary = summarizeUsage(await listUsageRecords());
    // Estimated values stay out of the reported totals.
    expect(summary.reportedInputTokens).toBe(0);
    expect(summary.reportedOutputTokens).toBe(0);
    expect(summary.reportedTotalTokens).toBe(0);
    expect(summary.unavailableRequests).toBe(0);
  });

  it("records interrupted requests separately from completed ones", async () => {
    const handle = startUsageRequest({ providerId: "gemini", modelId: "gemini-test" });
    const record = await handle.interrupt();

    expect(record.status).toBe("interrupted");
    expect(record.usageSource).toBe("unavailable");
  });

  it("records failed requests with a safe error code", async () => {
    const handle = startUsageRequest({ providerId: "gemini", modelId: "gemini-test" });
    const record = await handle.fail("rate_limited");

    expect(record.status).toBe("failed");
    expect(record.errorCode).toBe("rate_limited");
  });

  it("settles a request exactly once when an abort races a failure", async () => {
    const handle = startUsageRequest({ providerId: "gemini", modelId: "gemini-test" });
    const first = await handle.interrupt();
    const second = await handle.fail("network_error");
    const third = await handle.complete(reported);

    expect(handle.settled).toBe(true);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(await listUsageRecords()).toHaveLength(1);
  });

  it("aggregates totals, per-provider, per-model, and recent requests", async () => {
    const at = (minute: number) => `2026-11-20T10:${String(minute).padStart(2, "0")}:00.000Z`;
    await startUsageRequest({ providerId: "gemini", modelId: "gemini-pro", conversationId: "c1", now: at(1) }).complete(reported);
    await startUsageRequest({ providerId: "gemini", modelId: "gemini-flash", now: at(2) }).complete({ inputTokens: 30, outputTokens: 10, totalTokens: 40, source: "provider_reported" });
    await startUsageRequest({ providerId: "other", modelId: "other-model", now: at(3) }).complete(undefined);
    await startUsageRequest({ providerId: "gemini", modelId: "gemini-flash", now: at(4) }).fail("provider_unavailable");
    await startUsageRequest({ providerId: "gemini", modelId: "gemini-pro", now: at(5) }).interrupt();

    const summary = summarizeUsage(await listUsageRecords());

    expect(summary.totalRequests).toBe(5);
    expect(summary.completedRequests).toBe(3);
    expect(summary.failedRequests).toBe(1);
    expect(summary.interruptedRequests).toBe(1);
    expect(summary.unavailableRequests).toBe(3);
    expect(summary.reportedInputTokens).toBe(150);
    expect(summary.reportedOutputTokens).toBe(55);
    expect(summary.reportedTotalTokens).toBe(205);
    expect(summary.byProvider.map((entry) => [entry.key, entry.requests])).toEqual([["gemini", 4], ["other", 1]]);
    expect(summary.byModel.map((entry) => [entry.key, entry.requests])).toEqual([
      ["gemini-flash", 2],
      ["gemini-pro", 2],
      ["other-model", 1],
    ]);
    // Recent requests are newest-first.
    expect(summary.recent.map((record) => record.createdAt)).toEqual([at(5), at(4), at(3), at(2), at(1)]);
    expect(summary.recent[0]?.status).toBe("interrupted");
  });

  it("clears stored usage records", async () => {
    await startUsageRequest({ providerId: "gemini", modelId: "gemini-test" }).complete(reported);
    expect(await listUsageRecords()).toHaveLength(1);

    await clearUsageRecords();

    expect(await listUsageRecords()).toEqual([]);
  });

  it("validates and normalizes provider usage values", () => {
    expect(normalizeUsage(undefined)).toBeUndefined();
    expect(normalizeUsage({ source: "provider_reported" })).toBeUndefined();
    expect(normalizeUsage({ inputTokens: Number.NaN, outputTokens: -5, source: "provider_reported" })).toBeUndefined();
    // A missing total is derived only when both parts are known.
    expect(normalizeUsage({ inputTokens: 10, outputTokens: 4, source: "provider_reported" }))
      .toEqual({ inputTokens: 10, outputTokens: 4, totalTokens: 14, source: "provider_reported" });
    // A provider-reported total wins over a derived one.
    expect(normalizeUsage({ inputTokens: 10, outputTokens: 4, totalTokens: 99, source: "provider_reported" })?.totalTokens).toBe(99);
  });

  it("estimates tokens only as an explicitly approximate hint", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("hello world")).toBe(3);
    expect(estimateRequestTokens(["hello world", undefined, "abcdefgh"])).toBe(5);
  });
});
