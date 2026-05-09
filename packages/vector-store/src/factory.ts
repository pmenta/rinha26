/**
 * @fileoverview Factory `createVectorIndex(kind, refs)` — único ponto de troca de
 * implementação a partir do `apps/api`. A escolha vem de
 * `process.env.VECTOR_INDEX_KIND` (`AGENTS.md` §10).
 */

import { BruteForceVectorIndex, type ReferenceVector, type VectorIndexPort } from '@rinha26/core';

/** Discriminador legível para a env `VECTOR_INDEX_KIND`. */
export type VectorIndexKind = 'brute-force' | 'kd-tree' | 'vp-tree' | 'hnsw';

/**
 * Cria um {@link VectorIndexPort} a partir do kind escolhido.
 *
 * Hoje só `brute-force` está implementado; outros kinds lançam erro explícito —
 * a chave `VECTOR_INDEX_KIND` no docker-compose deve refletir só o que está pronto.
 */
export function createVectorIndex(
  kind: VectorIndexKind,
  references: readonly ReferenceVector[],
): VectorIndexPort {
  switch (kind) {
    case 'brute-force':
      return new BruteForceVectorIndex(references);
    case 'kd-tree':
    case 'vp-tree':
    case 'hnsw':
      throw new Error(
        `[@rinha26/vector-store] kind '${kind}' ainda não implementado (Fase 5). ` +
          `Use 'brute-force' por enquanto.`,
      );
    default: {
      const _exhaustive: never = kind;
      throw new Error(`[@rinha26/vector-store] kind desconhecido: ${String(_exhaustive)}`);
    }
  }
}
