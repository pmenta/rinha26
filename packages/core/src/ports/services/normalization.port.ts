/**
 * @fileoverview Port `NormalizationConfigPort` — devolve as constantes de normalização.
 */

import type { Normalization } from '../../domain/value-objects/normalization.js';

/**
 * Contrato síncrono. Implementação default carrega `resources/normalization.json`
 * uma vez no startup e devolve sempre a mesma referência imutável.
 */
export interface NormalizationConfigPort {
  /** Devolve as constantes carregadas (validadas via `NormalizationSchema`). */
  get(): Normalization;
}
