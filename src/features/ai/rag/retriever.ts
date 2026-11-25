import { embeddingRegistry } from "../embeddings/registry";
import { lexicalScore, cosineSimilarity } from "./similarity";
import { indexedDbRagStorage, type RagStorageAdapter } from "./vectorStore";
import type { DocumentChunk, RetrievalSource } from "./types";

export type RetrieveOptions = {
  signal?: AbortSignal;
  topK?: number;
  maxPerDocument?: number;
  minimumScore?: number;
};

type RankedChunk = { chunk: DocumentChunk; score: number };

export async function retrieveChunks(
  workspaceId: string,
  query: string,
  options: RetrieveOptions = {},
  storage: RagStorageAdapter = indexedDbRagStorage,
): Promise<RetrievalSource[]> {
  if (!query.trim()) return [];
  const provider = embeddingRegistry.resolve();
  const model = provider.listModels()[0];
  if (!model) throw new Error("No local embedding model is available.");
  const [embedded] = await provider.embed(
    [query],
    options.signal ? { signal: options.signal } : {},
  );
  if (!embedded) return [];
  const chunks = await storage.listChunks(workspaceId);
  const compatible = chunks.filter(
    (chunk) =>
      chunk.embeddingProviderId === provider.id &&
      chunk.embeddingModelId === model.id &&
      chunk.dimensions === embedded.dimensions,
  );
  const ranked: RankedChunk[] = compatible
    .map((chunk) => {
      const semantic = cosineSimilarity(embedded.vector, chunk.vector);
      const lexical = lexicalScore(
        query,
        `${chunk.documentTitle}\n${chunk.headingPath.join(" ")}\n${chunk.content}`,
      );
      // Cosine is [-1,1]; map to [0,1] and combine with a simple term match.
      return { chunk, score: (Math.max(0, semantic + 1) / 2) * 0.75 + lexical * 0.25 };
    })
    .filter((item) => Number.isFinite(item.score));
  ranked.sort(
    (left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id),
  );

  const sources: RetrievalSource[] = [];
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const maxPerDocument = options.maxPerDocument ?? 3;
  const topK = options.topK ?? 6;
  const minScore = options.minimumScore ?? 0.32;
  for (const item of ranked) {
    if (item.score < minScore || sources.length >= topK) break;
    const docCount = counts.get(item.chunk.documentId) ?? 0;
    if (docCount >= maxPerDocument) continue;
    const normalized = item.chunk.content.toLocaleLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    counts.set(item.chunk.documentId, docCount + 1);
    sources.push({
      chunkId: item.chunk.id,
      documentId: item.chunk.documentId,
      documentTitle: item.chunk.documentTitle,
      headingPath: item.chunk.headingPath,
      score: item.score,
      excerpt: item.chunk.content.slice(0, 1200),
    });
  }
  return sources;
}
