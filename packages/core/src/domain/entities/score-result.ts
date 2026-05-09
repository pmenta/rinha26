/**
 * @fileoverview Entidade `ScoreResult` — saída de `POST /fraud-score`
 * (`docs/API.md`).
 */

/**
 * Decisão final da API.
 *
 * Regra (`docs/REGRAS_DE_DETECCAO.md` §"Como a decisão é tomada"):
 * - `fraud_score = n_fraudes_top_k / k`, com `k = 5`.
 * - `approved = fraud_score < 0.6` (threshold fixo).
 */
export interface ScoreResult {
  readonly approved: boolean;
  readonly fraud_score: number;
}
