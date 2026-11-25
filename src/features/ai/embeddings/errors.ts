export type EmbeddingErrorCode =
  "cancelled" | "model_load_failed" | "embedding_failed" | "invalid_vector";

export class EmbeddingError extends Error {
  override readonly name = "EmbeddingError";

  constructor(
    readonly code: EmbeddingErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}
