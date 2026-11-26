import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  complete: vi.fn().mockResolvedValue(undefined),
  interrupt: vi.fn().mockResolvedValue(undefined),
  fail: vi.fn().mockResolvedValue(undefined),
  resolveActiveProviderSession: vi.fn(),
  trackProviderRequest: vi.fn(() => vi.fn()),
}));

vi.mock("../settings/providerConfiguration", () => ({
  resolveActiveProviderSession: mocks.resolveActiveProviderSession,
  trackProviderRequest: mocks.trackProviderRequest,
}));

vi.mock("../usage/usageStore", () => ({
  startUsageRequest: vi.fn(() => ({
    complete: mocks.complete,
    interrupt: mocks.interrupt,
    fail: mocks.fail,
  })),
}));

import { generateMarkdownCompletion, rewriteSelectedMarkdown } from "./completionService";

describe("provider-backed Markdown suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.complete.mockResolvedValue(undefined);
    mocks.interrupt.mockResolvedValue(undefined);
    mocks.fail.mockResolvedValue(undefined);
    mocks.generateText.mockResolvedValue({ text: "  next line\n", model: "fake-model" });
    mocks.resolveActiveProviderSession.mockReturnValue({ providerId: "openai", generateText: mocks.generateText });
  });

  it("generates an insertion-only completion with bounded cursor context and usage tracking", async () => {
    const signal = new AbortController().signal;
    const suggestion = await generateMarkdownCompletion({
      model: "fake-model",
      prefix: "a".repeat(5000),
      suffix: "b".repeat(2000),
      signal,
    });
    expect(suggestion).toBe("next line");
    const request = mocks.generateText.mock.calls[0]?.[0];
    expect(request.model).toBe("fake-model");
    expect(request.maxOutputTokens).toBe(180);
    const context = JSON.parse(request.messages[0].content);
    expect(context.prefix).toHaveLength(4000);
    expect(context.suffix).toHaveLength(1200);
    expect(context.selected).toBe("");
    expect(context.instruction).toContain("exact text to insert");
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.trackProviderRequest).toHaveBeenCalledOnce();
  });

  it("sends the selection and nearby context for a replacement preview", async () => {
    const result = await rewriteSelectedMarkdown({
      model: "fake-model",
      prefix: "before paragraph",
      selected: "unclear sentence",
      suffix: "after paragraph",
      signal: new AbortController().signal,
    });
    expect(result).toBe("next line");
    const context = JSON.parse(mocks.generateText.mock.calls[0]?.[0].messages[0].content);
    expect(context).toMatchObject({
      prefix: "before paragraph",
      selected: "unclear sentence",
      suffix: "after paragraph",
    });
    expect(context.instruction).toContain("Rewrite only the selected Markdown text");
  });

  it("records provider failures and rethrows the sanitized error", async () => {
    const failure = new Error("provider unavailable");
    mocks.generateText.mockRejectedValue(failure);
    await expect(
      generateMarkdownCompletion({
        model: "fake-model",
        prefix: "",
        suffix: "",
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(failure);
    expect(mocks.fail).toHaveBeenCalledWith("unknown");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("records cancellation as interrupted", async () => {
    mocks.generateText.mockImplementation(({ signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      }),
    );
    const controller = new AbortController();
    const pending = generateMarkdownCompletion({
      model: "fake-model",
      prefix: "prefix",
      suffix: "",
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.interrupt).toHaveBeenCalledOnce();
    expect(mocks.fail).not.toHaveBeenCalled();
  });
});
