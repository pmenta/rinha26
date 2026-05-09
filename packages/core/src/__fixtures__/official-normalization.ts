/**
 * @fileoverview Cópia das constantes oficiais de `resources/normalization.json`,
 * para uso em testes unitários sem leitura de filesystem.
 */

import type { Normalization } from '../domain/value-objects/normalization.js';

/** Constantes oficiais de normalização (`resources/normalization.json`). */
export const OFFICIAL_NORMALIZATION: Normalization = {
  max_amount: 10_000,
  max_installments: 12,
  amount_vs_avg_ratio: 10,
  max_minutes: 1_440,
  max_km: 1_000,
  max_tx_count_24h: 20,
  max_merchant_avg_amount: 10_000,
};
