/**
 * @fileoverview Adapter `BruteForceVectorIndex` — implementação **baseline** do
 * {@link VectorIndexPort}.
 *
 * Estratégia: percorre todo o dataset uma vez por consulta, calcula distância
 * euclidiana ao quadrado (sem `sqrt`, suficiente para ordenar) e mantém um top-K.
 *
 * Custo: `O(N · D)` por consulta (D = 14). Com `N = 3M`, isso é ~42M operações
 * por requisição — alto, mas serve como **referência de correção** para validar
 * implementações mais rápidas em `packages/vector-store` (KD-tree, VP-tree, HNSW).
 *
 * **Cuidados**:
 * - Aceita o sentinela `-1` nas posições 5 e 6 sem tratamento especial — a
 *   distância é calculada literalmente, o que mantém registros sem histórico
 *   próximos uns dos outros (por design do dataset).
 */

import type { IResult } from 'typescript-monads';
import { fail, ok } from 'typescript-monads';

import type { ReferenceVector } from '../../domain/entities/reference-vector.js';
import {
  type VectorIndexError,
  vectorIndexError,
} from '../../domain/errors/infrastructure.errors.js';
import {
  FEATURE_VECTOR_LENGTH,
  type FeatureVector,
} from '../../domain/value-objects/feature-vector.js';
import type { VectorIndexPort } from '../../ports/services/vector-index.port.js';

/** Resultado intermediário da busca — distância² + ref. Não é exportado. */
interface ScoredRef {
  readonly distSq: number;
  readonly ref: ReferenceVector;
}

/** Distância euclidiana ao quadrado entre dois vetores de 14 dimensões. */
function euclideanSq(a: FeatureVector, b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < FEATURE_VECTOR_LENGTH; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

/** Insere `cand` no topo, mantendo o array ordenado por distância crescente. */
function pushTopK(top: ScoredRef[], cand: ScoredRef, k: number): void {
  if (top.length < k) {
    top.push(cand);
    top.sort((a, b) => a.distSq - b.distSq);
    return;
  }
  if (cand.distSq < top[k - 1].distSq) {
    top[k - 1] = cand;
    top.sort((a, b) => a.distSq - b.distSq);
  }
}

/**
 * Índice ingênuo (`O(N · D)`). Útil como baseline e oráculo de testes.
 */
export class BruteForceVectorIndex implements VectorIndexPort {
  constructor(private readonly references: readonly ReferenceVector[]) {}

  query(
    query: FeatureVector,
    k: number,
  ): IResult<readonly ReferenceVector[], VectorIndexError> {
    if (k <= 0) {
      return fail<readonly ReferenceVector[], VectorIndexError>(
        vectorIndexError(`k must be > 0, got ${k}`),
      );
    }

    const top: ScoredRef[] = [];
    const refs = this.references;
    for (let i = 0; i < refs.length; i += 1) {
      const ref = refs[i];
      if (ref.vector.length !== FEATURE_VECTOR_LENGTH) {
        return fail<readonly ReferenceVector[], VectorIndexError>(
          vectorIndexError(
            `reference vector at index ${i} has length ${ref.vector.length}, expected ${FEATURE_VECTOR_LENGTH}`,
          ),
        );
      }
      pushTopK(top, { distSq: euclideanSq(query, ref.vector), ref }, k);
    }

    return ok<readonly ReferenceVector[], VectorIndexError>(top.map((s) => s.ref));
  }
}
