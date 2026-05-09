/**
 * @fileoverview Erros de infraestrutura (I/O com adapters). Use cases combinam estes
 * com erros de domínio em uma union e retornam via `IResult`.
 */

/** Falha ao acessar um repositório (ex.: leitura do `references.json.gz`). */
export interface RepositoryError {
  readonly _tag: 'RepositoryError';
  readonly message: string;
  readonly cause?: unknown;
}

/** Falha ao consultar um índice vetorial. */
export interface VectorIndexError {
  readonly _tag: 'VectorIndexError';
  readonly message: string;
  readonly cause?: unknown;
}

/** Union agregada dos erros de infraestrutura. */
export type InfrastructureError = RepositoryError | VectorIndexError;

/** Construtor do erro {@link RepositoryError}. */
export function repositoryError(message: string, cause?: unknown): RepositoryError {
  return { _tag: 'RepositoryError', message, cause };
}

/** Construtor do erro {@link VectorIndexError}. */
export function vectorIndexError(message: string, cause?: unknown): VectorIndexError {
  return { _tag: 'VectorIndexError', message, cause };
}
