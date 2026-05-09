/**
 * @fileoverview Port `VectorIndexPort` — busca KNN sobre vetores de 14 dimensões.
 *
 * Várias implementações vão coexistir em `packages/vector-store`:
 * - `brute-force` — baseline `O(N · D)` com loop simples.
 * - `kd-tree`, `vp-tree` — busca exata sub-linear.
 * - `hnsw`, `ivf`, `lsh` — ANN aproximado.
 *
 * Trocas entre implementações são controladas por env (`VECTOR_INDEX_KIND`) ou em
 * benchmarks (Fase 5). Toda implementação deve passar nos mesmos testes de
 * equivalência (top-K igual ao brute-force em dataset pequeno determinístico).
 */

import type { IResult } from 'typescript-monads';

import type { ReferenceVector } from '../../domain/entities/reference-vector.js';
import type { VectorIndexError } from '../../domain/errors/infrastructure.errors.js';
import type { FeatureVector } from '../../domain/value-objects/feature-vector.js';

/** Contrato síncrono da consulta KNN. */
export interface VectorIndexPort {
  /**
   * Retorna até `k` vetores mais próximos de `query`, ordenados do mais próximo para
   * o mais distante. A métrica de distância é responsabilidade da implementação
   * (default no domínio: euclidiana com 14 dimensões).
   *
   * Implementações **não devem** mutar o array recebido nem o array devolvido após
   * retorno (snapshot imutável).
   */
  query(
    query: FeatureVector,
    k: number,
  ): IResult<readonly ReferenceVector[], VectorIndexError>;
}
