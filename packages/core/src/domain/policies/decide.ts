/**
 * @fileoverview Policy `decide` — converte os top-K vizinhos em um
 * {@link ScoreResult} (`docs/REGRAS_DE_DETECCAO.md` §"Como a decisão é tomada").
 */

import type { ReferenceVector } from '../entities/reference-vector.js';
import type { ScoreResult } from '../entities/score-result.js';

/** `k` do KNN, conforme regra fixa do desafio. */
export const KNN_K = 5 as const;

/** Limiar acima do qual a transação é negada. Regra fixa: `0.6`. */
export const FRAUD_THRESHOLD = 0.6 as const;

/**
 * Calcula `fraud_score` e `approved` a partir dos vizinhos.
 *
 * Função pura. **Não** valida `neighbors.length === k` — quem garante isso é o
 * `VectorIndexPort.query`. Se vier com menos vizinhos, a fração ainda é calculada
 * sobre o tamanho real (defensivo), mas isso é considerado degradação e o ideal é
 * que o adapter sempre devolva `k` vetores ou retorne `IResult.fail`.
 *
 * @param neighbors  Vizinhos retornados pelo índice vetorial.
 * @param threshold  Limiar de aprovação (default {@link FRAUD_THRESHOLD}).
 */
export function decide(
  neighbors: readonly ReferenceVector[],
  threshold: number = FRAUD_THRESHOLD,
): ScoreResult {
  const total = neighbors.length;
  if (total === 0) {
    return { approved: true, fraud_score: 0 };
  }

  let fraudCount = 0;
  for (let i = 0; i < total; i += 1) {
    if (neighbors[i].label === 'fraud') fraudCount += 1;
  }

  const fraudScore = fraudCount / total;
  return {
    approved: fraudScore < threshold,
    fraud_score: fraudScore,
  };
}
