/**
 * @fileoverview Rota `POST /fraud-score` — recebe payload, valida via Zod, delega
 * ao `ScoreTransactionUseCase` e mapeia erros de domínio para HTTP.
 *
 * Decisões deliberadas para o regime do desafio (`docs/AVALIACAO.md` §"HTTP 500
 * tem impacto duplo"):
 *
 * - **Single source of truth de schema**: Zod (`ScoreTransactionInputSchema` no
 *   core). Não declaramos schema TypeBox da Elysia — duplicar gera dois pontos
 *   de falha e expõe a API a 422/500 vindos do TypeBox antes do Zod ser ouvido.
 *   Aceitamos `body: unknown` no handler e validamos manualmente.
 * - **Sem 4xx/5xx do scoring**: erro HTTP no scoring custa **5×** (peso `Err`)
 *   na taxa ponderada e ainda conta na taxa de falhas (corte em 15% — ver
 *   `docs/AVALIACAO.md`). Em qualquer falha — payload inválido ou erro de
 *   infraestrutura — devolvemos a classificação default-safe
 *   `{ approved: true, fraud_score: 0 }` com `200`. Trocamos um possível `Err`
 *   por um possível `FN` (peso 3) — ainda assim mais barato.
 *   Esta política pode ser revertida quando o p99 estiver folgado.
 */

import { Elysia, t } from 'elysia';

import {
  type ScoreTransactionUseCase,
  ScoreTransactionInputSchema,
} from '@rinha26/core';

import type { Metrics } from '../metrics.js';

const ResponseShape = t.Object({
  approved: t.Boolean(),
  fraud_score: t.Number(),
});

const DEFAULT_SAFE_RESPONSE = Object.freeze({ approved: true, fraud_score: 0 });

/**
 * Factory da rota. Recebe o use case + `Metrics` injetados pelo container e
 * devolve a Elysia instance.
 *
 * `Metrics` é opcional para retro-compat com testes existentes que só
 * passam o use case; quando ausente, contadores não são incrementados.
 *
 * Nota: o tipo de retorno **não é anotado** intencionalmente — Elysia depende de
 * inferência paramétrica para preservar metadados de rotas (path, body, response).
 * Anotar com `: Elysia` apaga isso e quebra `.use(...)`/composição.
 */
export const fraudScoreController = (
  useCase: ScoreTransactionUseCase,
  metrics?: Metrics,
) =>
  new Elysia().post(
    '/fraud-score',
    ({ body }) => {
      const parsed = ScoreTransactionInputSchema.safeParse(body);
      if (!parsed.success) {
        metrics?.incDefaultSafeInvalidBody();
        return DEFAULT_SAFE_RESPONSE;
      }

      const result = useCase.execute(parsed.data);
      if (result.isFail()) {
        metrics?.incDefaultSafeUseCaseFail();
        return DEFAULT_SAFE_RESPONSE;
      }

      metrics?.incKnnReal();
      return result.unwrap();
    },
    {
      // Body é "qualquer JSON" — a validação real fica no Zod (single source of
      // truth). Vide fileoverview.
      body: t.Any(),
      response: { 200: ResponseShape },
      detail: {
        summary: 'Decide aprovação da transação por busca vetorial KNN',
        description:
          'Vetoriza o payload em 14 dimensões, busca os k=5 vizinhos mais ' +
          'próximos no dataset de referência e devolve { approved, fraud_score }. ' +
          'fraud_score = n_fraudes_top5 / 5; approved = fraud_score < 0.6.',
        tags: ['fraud'],
      },
    },
  );
