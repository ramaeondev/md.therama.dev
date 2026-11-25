import { describe, expect, it } from "vitest";

import { buildRetrievedContext } from "./contextBuilder";
import { cosineSimilarity, lexicalScore } from "./similarity";

describe("RAG ranking helpers", () => {
  it("calculates cosine similarity and rejects invalid vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(Number.NEGATIVE_INFINITY);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(Number.NEGATIVE_INFINITY);
    expect(cosineSimilarity([Number.NaN], [1])).toBe(Number.NEGATIVE_INFINITY);
  });

  it("adds a lexical complement and builds bounded, untrusted context", () => {
    expect(
      lexicalScore("refresh token", "Use short-lived refresh tokens for sessions"),
    ).toBeGreaterThan(0);
    const source = {
      chunkId: "c1",
      documentId: "d1",
      documentTitle: "Security.md",
      headingPath: ["Sessions", "Refresh tokens"],
      score: 0.8,
      excerpt: "Refresh tokens rotate after use.",
    };
    const built = buildRetrievedContext([source]);
    expect(built.text).toContain("untrusted reference data");
    expect(built.text).toContain("Security.md");
    expect(built.text).toContain("Refresh tokens");
    expect(built.sources).toEqual([source]);
    expect(buildRetrievedContext([])).toEqual({ text: "", sources: [] });
  });
});
