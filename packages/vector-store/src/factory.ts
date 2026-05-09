/**
 * @fileoverview Factory `createVectorIndex(kind, refs)` — único ponto de troca de
 * implementação a partir do `apps/api`. A escolha vem de
 * `process.env.VECTOR_INDEX_KIND` (`AGENTS.md` §10).
 */

import { BruteForceVectorIndex, type ReferenceVector, type VectorIndexPort } from '@rinha26/core';

import { I16BruteForceVectorIndex } from './i16/i16-brute-force-vector-index.js';

/** Discriminador legível para a env `VECTOR_INDEX_KIND`. */
export type VectorIndexKind =
  | 'brute-force'
  | 'i16-brute-force'
  | 'kd-tree'
  | 'vp-tree'
  | 'hnsw';

/**
 * Cria um {@link VectorIndexPort} a partir do kind escolhido.
 *
 * Implementadas (Fase 5+):
 * - `brute-force` — baseline `O(N · D)` em `f32` (`@rinha26/core`).
 * - `i16-brute-force` — mesmo brute-force mas com vetores quantizados em `i16`
 *   (50% menos RAM, mais cache hits). Veja `docs/adr/004-quantizacao-i16.md`.
 *
 * Não implementadas: `kd-tree`, `vp-tree`, `hnsw` — lançam erro descritivo.
 */
export function createVectorIndex(
  kind: VectorIndexKind,
  references: readonly ReferenceVector[],
): VectorIndexPort {
  switch (kind) {
    case 'brute-force':
      return new BruteForceVectorIndex(references);
    case 'i16-brute-force':
      return I16BruteForceVectorIndex.fromReferenceVectors(references);
    case 'kd-tree':
    case 'vp-tree':
    case 'hnsw':
      throw new Error(
        `[@rinha26/vector-store] kind '${kind}' ainda não implementado. ` +
          `Use 'brute-force' ou 'i16-brute-force' por enquanto.`,
      );
    default: {
      const _exhaustive: never = kind;
      throw new Error(`[@rinha26/vector-store] kind desconhecido: ${String(_exhaustive)}`);
    }
  }
}
