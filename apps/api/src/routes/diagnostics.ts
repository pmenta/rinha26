/**
 * @fileoverview Rota `GET /diagnostics` — endpoint **interno** (não faz parte
 * do contrato oficial em `docs/API.md`) usado para detectar regressões e
 * race conditions durante harness/local dev.
 *
 * Devolve estado de prontidão + contadores por categoria de resposta. O
 * `score-simulator` faz snapshot antes/depois para reportar quantas reqs
 * caíram em `default-safe` (ADR-002) — sinal de saturação ou cold-start
 * intermitente.
 *
 * **Não está rate-limited** — só local/dev. Se um dia for exposto em prod,
 * adicionar autenticação leve.
 */

import { Elysia } from 'elysia';

import type { Metrics } from '../metrics.js';

export interface DiagnosticsContext {
  readonly readiness: () => boolean;
  readonly vectorIndexKind: string;
  readonly referenceCount: () => number;
  readonly metrics: Metrics;
}

/**
 * Factory: aceita o container e devolve a Elysia instance da rota
 * `GET /diagnostics`. Não anote o tipo de retorno (vide hurdle §11.2).
 */
export const diagnosticsController = (ctx: DiagnosticsContext) =>
  new Elysia().get('/diagnostics', () => ({
    ready: ctx.readiness(),
    vector_index_kind: ctx.vectorIndexKind,
    reference_count: ctx.referenceCount(),
    metrics: ctx.metrics.snapshot(),
  }));
