/**
 * @fileoverview Port `ClockPort` — abstração de relógio para testabilidade.
 *
 * No desafio, tempos relevantes (`requested_at`, `last_transaction.timestamp`) vêm do
 * payload — o clock é injetado por completude (latência futura, métricas, etc.).
 */

/** Relógio injetável. */
export interface ClockPort {
  /** Instante atual em UTC. */
  now(): Date;
}
