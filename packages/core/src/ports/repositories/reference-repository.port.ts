/**
 * @fileoverview Port `ReferenceRepositoryPort` — leitura do dataset de referência
 * (`resources/references.json.gz`).
 *
 * Implementações reais ficam em `apps/api` (carga via streaming gzip do filesystem)
 * ou em `packages/vector-store` se houver pré-processamento que produza um adapter
 * combinando `repository + vector-index` (ex.: HNSW indexado no startup).
 */

import type { IResult } from 'typescript-monads';

import type { ReferenceVector } from '../../domain/entities/reference-vector.js';
import type { RepositoryError } from '../../domain/errors/infrastructure.errors.js';

/**
 * Carrega todos os {@link ReferenceVector} disponíveis. Para 3M registros, prefira
 * stream + indexação incremental — esta API é apenas o contrato lógico.
 */
export interface ReferenceRepositoryPort {
  /**
   * Devolve a lista completa do dataset de referência.
   *
   * Em produção, **não** consumir tudo em memória sem necessidade: o `apps/api` faz
   * a indexação no startup e descarta a lista. Adapters com streaming podem expor
   * APIs adicionais — esta assinatura é apenas o contrato mínimo.
   */
  loadAll(): Promise<IResult<readonly ReferenceVector[], RepositoryError>>;
}
