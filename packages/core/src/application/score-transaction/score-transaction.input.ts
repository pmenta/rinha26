/**
 * @fileoverview Schema Zod do input de {@link ScoreTransactionUseCase}. Reflete o
 * contrato de `POST /fraud-score` (`docs/API.md`).
 *
 * Adapters HTTP/CLI usam este schema na borda (Standard Schema do Elysia) — o use
 * case recebe o tipo já inferido e assume input coerente.
 */

import { z } from 'zod';

const TransactionSchema = z
  .object({
    amount: z.number(),
    installments: z.number().int().nonnegative(),
    requested_at: z.string().datetime({ offset: true }),
  })
  .strict();

const CustomerSchema = z
  .object({
    avg_amount: z.number(),
    tx_count_24h: z.number().int().nonnegative(),
    known_merchants: z.array(z.string()),
  })
  .strict();

const MerchantSchema = z
  .object({
    id: z.string(),
    mcc: z.string(),
    avg_amount: z.number(),
  })
  .strict();

const TerminalSchema = z
  .object({
    is_online: z.boolean(),
    card_present: z.boolean(),
    km_from_home: z.number(),
  })
  .strict();

const LastTransactionSchema = z
  .object({
    timestamp: z.string().datetime({ offset: true }),
    km_from_current: z.number(),
  })
  .strict();

/**
 * Schema do payload inteiro de `POST /fraud-score`. `last_transaction` aceita
 * `null` (transação sem histórico).
 */
export const ScoreTransactionInputSchema = z
  .object({
    id: z.string(),
    transaction: TransactionSchema,
    customer: CustomerSchema,
    merchant: MerchantSchema,
    terminal: TerminalSchema,
    last_transaction: z.union([LastTransactionSchema, z.null()]),
  })
  .strict()
  .describe('Payload de POST /fraud-score (docs/API.md)');

/** Tipo inferido do {@link ScoreTransactionInputSchema}. */
export type ScoreTransactionInput = z.infer<typeof ScoreTransactionInputSchema>;
