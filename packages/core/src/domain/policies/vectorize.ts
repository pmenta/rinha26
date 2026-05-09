/**
 * @fileoverview Policy `vectorize` — converte uma {@link FraudTransaction} em um
 * {@link FeatureVector} de 14 dimensões, seguindo `docs/REGRAS_DE_DETECCAO.md`.
 *
 * Função **pura**, sem dependência de I/O. As constantes vêm de {@link Normalization}
 * (carregadas do `resources/normalization.json` na borda) e o risco MCC vem de uma
 * função pura `mccRisk(mcc) → number` (default `0.5` quando ausente — também já
 * resolvido na borda).
 */

import type { FraudTransaction } from '../entities/fraud-transaction.js';
import type { FeatureVector } from '../value-objects/feature-vector.js';
import {
  NULL_LAST_TX_SENTINEL,
  clamp01,
} from '../value-objects/feature-vector.js';
import type { Normalization } from '../value-objects/normalization.js';

/**
 * Função de lookup de risco por MCC. Implementação default em
 * {@link defaultMccRisk}; em produção isso é {@link McccRiskPort.lookup}.
 */
export type MccRiskLookup = (mcc: string) => number;

/**
 * Default oficial: `0.5` quando a categoria não está em `mcc_risk.json`
 * (`docs/DATASET.md`).
 */
export const DEFAULT_MCC_RISK = 0.5 as const;

/** Lookup que sempre devolve {@link DEFAULT_MCC_RISK}. Útil em testes minimalistas. */
export const defaultMccRisk: MccRiskLookup = () => DEFAULT_MCC_RISK;

/**
 * Vetoriza a transação aplicando as 14 fórmulas de `docs/REGRAS_DE_DETECCAO.md`.
 *
 * Hot path do desafio — escrito para ser barato:
 * - Sem alocação além do array final.
 * - Aritmética direta; `clamp01` inlinable.
 * - `Date.parse` é usado apenas para extrair `hour_of_day` e `day_of_week`; valida
 *   apenas o formato esperado (`requested_at` ISO-8601 UTC).
 *
 * @param tx          Payload bruto recebido em `POST /fraud-score`.
 * @param norm        Constantes de normalização (`resources/normalization.json`).
 * @param mccRisk     Lookup MCC → risco (com fallback para `0.5`).
 * @returns           {@link FeatureVector} pronto para a busca KNN.
 */
export function vectorize(
  tx: FraudTransaction,
  norm: Normalization,
  mccRisk: MccRiskLookup = defaultMccRisk,
): FeatureVector {
  const requestedAt = new Date(tx.transaction.requested_at);
  const hour = requestedAt.getUTCHours();
  // `getUTCDay`: domingo=0..sábado=6. A regra do desafio é seg=0..dom=6, então
  // remapeamos: (jsDay + 6) % 7  (segunda(1) → 0, ... domingo(0) → 6).
  const dayOfWeek = (requestedAt.getUTCDay() + 6) % 7;

  const lastTx = tx.last_transaction;
  let minutesSinceLast: number;
  let kmFromLast: number;
  if (lastTx === null) {
    minutesSinceLast = NULL_LAST_TX_SENTINEL;
    kmFromLast = NULL_LAST_TX_SENTINEL;
  } else {
    const lastMs = new Date(lastTx.timestamp).getTime();
    const currMs = requestedAt.getTime();
    const minutesDelta = (currMs - lastMs) / 60_000;
    minutesSinceLast = clamp01(minutesDelta / norm.max_minutes);
    kmFromLast = clamp01(lastTx.km_from_current / norm.max_km);
  }

  const knownMerchants = tx.customer.known_merchants;
  let unknownMerchant: 0 | 1 = 1;
  for (let i = 0; i < knownMerchants.length; i += 1) {
    if (knownMerchants[i] === tx.merchant.id) {
      unknownMerchant = 0;
      break;
    }
  }

  return [
    /*  0 amount                */ clamp01(tx.transaction.amount / norm.max_amount),
    /*  1 installments          */ clamp01(tx.transaction.installments / norm.max_installments),
    /*  2 amount_vs_avg         */ clamp01(
      tx.transaction.amount / tx.customer.avg_amount / norm.amount_vs_avg_ratio,
    ),
    /*  3 hour_of_day           */ hour / 23,
    /*  4 day_of_week           */ dayOfWeek / 6,
    /*  5 minutes_since_last_tx */ minutesSinceLast,
    /*  6 km_from_last_tx       */ kmFromLast,
    /*  7 km_from_home          */ clamp01(tx.terminal.km_from_home / norm.max_km),
    /*  8 tx_count_24h          */ clamp01(tx.customer.tx_count_24h / norm.max_tx_count_24h),
    /*  9 is_online             */ tx.terminal.is_online ? 1 : 0,
    /* 10 card_present          */ tx.terminal.card_present ? 1 : 0,
    /* 11 unknown_merchant      */ unknownMerchant,
    /* 12 mcc_risk              */ mccRisk(tx.merchant.mcc),
    /* 13 merchant_avg_amount   */ clamp01(
      tx.merchant.avg_amount / norm.max_merchant_avg_amount,
    ),
  ] as const;
}
