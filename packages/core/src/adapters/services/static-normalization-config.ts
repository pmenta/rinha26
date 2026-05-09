/**
 * @fileoverview Adapter `StaticNormalizationConfig` — devolve sempre a mesma
 * referência de {@link Normalization} passada no construtor.
 */

import type { NormalizationConfigPort } from '../../ports/services/normalization.port.js';
import type { Normalization } from '../../domain/value-objects/normalization.js';

/** Wrap simples; valida com `NormalizationSchema.parse(...)` na borda antes de injetar. */
export class StaticNormalizationConfig implements NormalizationConfigPort {
  constructor(private readonly value: Normalization) {}

  get(): Normalization {
    return this.value;
  }
}
