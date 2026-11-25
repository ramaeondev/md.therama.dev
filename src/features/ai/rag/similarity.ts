export function cosineSimilarity(left: ArrayLike<number>, right: ArrayLike<number>): number {
  if (!left.length || left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index]);
    const b = Number(right[index]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NEGATIVE_INFINITY;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return Number.NEGATIVE_INFINITY;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "could",
  "does",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "other",
  "over",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "using",
  "very",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
  "the",
  "for",
  "you",
  "not",
  "but",
  "can",
  "how",
  "why",
  "who",
  "all",
  "any",
  "our",
  "its",
]);

export function lexicalScore(query: string, text: string): number {
  const words = (value: string) =>
    value
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}_-]{2,}/gu)
      ?.filter((word) => !STOP_WORDS.has(word)) ?? [];
  const queryTerms = new Set(words(query));
  if (!queryTerms.size) return 0;
  const documentTerms = new Set(words(text));
  let matches = 0;
  for (const term of queryTerms) if (documentTerms.has(term)) matches += 1;
  return matches / queryTerms.size;
}
