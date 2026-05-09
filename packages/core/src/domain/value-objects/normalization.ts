/**
 * @fileoverview Value-object `Normalization` — constantes de normalização das 14
 * dimensões. Origem: `resources/normalization.json` (`docs/DATASET.md`).
 */

import { z } from 'zod';

/**
 * Schema/zod das constantes. Útil para validar o `normalization.json` na borda de I/O
 * (em `apps/api`) antes de injetar no use case.
 */
export const NormalizationSchema = z
  .object({
    /** Teto de `transaction.amount` — valores acima viram `1.0`. */
    max_amount: z.number().positive(),
    /** Teto de `transaction.installments` (12 parcelas = `1.0`). */
    max_installments: z.number().positive(),
    /** Divisor da razão `amount / customer.avg_amount` (`10×` a média = `1.0`). */
    amount_vs_avg_ratio: z.number().positive(),
    /** Janela em minutos para `minutes_since_last_tx` (1440 = 24h). */
    max_minutes: z.number().positive(),
    /** Teto de distância em km. */
    max_km: z.number().positive(),
    /** Teto de `customer.tx_count_24h` (20 = `1.0`). */
    max_tx_count_24h: z.number().positive(),
    /** Teto do ticket médio do comerciante. */
    max_merchant_avg_amount: z.number().positive(),
  })
  .describe('Constantes de normalização do dataset (resources/normalization.json)');

/** Tipo inferido de {@link NormalizationSchema}. */
export type Normalization = z.infer<typeof NormalizationSchema>;
