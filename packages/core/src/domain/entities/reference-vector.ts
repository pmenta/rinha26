/**
 * @fileoverview Entidade `ReferenceVector` — registro do dataset de referência
 * (`resources/references.json.gz`, 3M registros). Cada item é um vetor já vetorizado
 * (14 dimensões) e o rótulo correspondente (`fraud` | `legit`).
 */

/** Rótulo binário usado pelo KNN para classificar. */
export type ReferenceLabel = 'fraud' | 'legit';

/**
 * Vetor rotulado contra o qual a busca KNN é feita.
 *
 * **Importante (`docs/DATASET.md`):** os índices `5` (`minutes_since_last_tx`) e `6`
 * (`km_from_last_tx`) recebem o sentinela `-1` quando o registro original veio com
 * `last_transaction: null`. **Não filtrar nem substituir** — `-1` está fora de
 * `[0, 1]` por design e mantém esses casos próximos uns dos outros no espaço vetorial.
 */
export interface ReferenceVector {
  /** Vetor de 14 dimensões (`number[14]`). Validar tamanho = 14 na borda de I/O. */
  readonly vector: readonly number[];
  readonly label: ReferenceLabel;
}
