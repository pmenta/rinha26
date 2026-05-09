/**
 * @fileoverview Value-object `FeatureVector` — vetor de 14 dimensões da transação,
 * conforme `docs/REGRAS_DE_DETECCAO.md`.
 *
 * Não há classe: o vetor é um `readonly number[]` de tamanho fixo. As únicas operações
 * suportadas pelo domínio (clamp, vetorização) são funções puras nas policies.
 */

/**
 * Quantidade de dimensões do vetor de característica. Constante da regra do desafio
 * (`docs/REGRAS_DE_DETECCAO.md`).
 */
export const FEATURE_VECTOR_LENGTH = 14 as const;

/**
 * Sentinela usado nos índices `5` (`minutes_since_last_tx`) e `6` (`km_from_last_tx`)
 * quando a transação chega com `last_transaction: null`.
 *
 * Por design, fica fora de `[0, 1]` para que registros sem histórico fiquem naturalmente
 * próximos uns dos outros no espaço vetorial.
 */
export const NULL_LAST_TX_SENTINEL = -1 as const;

/**
 * Tupla de 14 dimensões.
 *
 * Convenção (`docs/REGRAS_DE_DETECCAO.md` §"As 14 dimensões do vetor"):
 *
 * | índice | dimensão                | faixa esperada                      |
 * |-------:|-------------------------|-------------------------------------|
 * |   0    | `amount`                | `[0, 1]`                            |
 * |   1    | `installments`          | `[0, 1]`                            |
 * |   2    | `amount_vs_avg`         | `[0, 1]`                            |
 * |   3    | `hour_of_day`           | `[0, 1]`                            |
 * |   4    | `day_of_week`           | `[0, 1]`                            |
 * |   5    | `minutes_since_last_tx` | `[0, 1]` ou `-1` se `last_tx=null`  |
 * |   6    | `km_from_last_tx`       | `[0, 1]` ou `-1` se `last_tx=null`  |
 * |   7    | `km_from_home`          | `[0, 1]`                            |
 * |   8    | `tx_count_24h`          | `[0, 1]`                            |
 * |   9    | `is_online`             | `0` ou `1`                          |
 * |  10    | `card_present`          | `0` ou `1`                          |
 * |  11    | `unknown_merchant`      | `0` ou `1` (1 = desconhecido)       |
 * |  12    | `mcc_risk`              | `[0, 1]` (default `0.5` se ausente) |
 * |  13    | `merchant_avg_amount`   | `[0, 1]`                            |
 */
export type FeatureVector = readonly [
  number, number, number, number, number, number, number,
  number, number, number, number, number, number, number,
];

/** Restringe `x` ao intervalo `[0, 1]` (clamp). Função pura, sem alocação. */
export function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
