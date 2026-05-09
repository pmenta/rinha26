/**
 * @fileoverview Spec da rota `POST /fraud-score` — usa Elysia em-memória.
 */

import { describe, expect, it } from 'vitest';

import {
  BruteForceVectorIndex,
  FakeMccRiskTable,
  OFFICIAL_MCC_RISK,
  OFFICIAL_NORMALIZATION,
  type ReferenceVector,
  ScoreTransactionUseCase,
  StaticNormalizationConfig,
} from '@rinha26/core';

import { fraudScoreController } from './fraud-score.js';

const fraudRefs: readonly ReferenceVector[] = Array.from({ length: 5 }, (_, i) => ({
  label: 'fraud' as const,
  vector: [1, 1, 1, 1, 1, -1, -1, 1, 1, 0, 1, 1, 0.85, 0.5].map(
    (x) => x - i * 1e-4,
  ) as readonly number[],
}));

const buildUseCase = (refs: readonly ReferenceVector[]) =>
  new ScoreTransactionUseCase({
    normalization: new StaticNormalizationConfig(OFFICIAL_NORMALIZATION),
    mccRisk: new FakeMccRiskTable(OFFICIAL_MCC_RISK),
    vectorIndex: new BruteForceVectorIndex(refs),
  });

const buildPayload = () => ({
  id: 'tx-3330991687',
  transaction: { amount: 9505.97, installments: 10, requested_at: '2026-03-14T05:15:12Z' },
  customer: {
    avg_amount: 81.28,
    tx_count_24h: 20,
    known_merchants: ['MERC-008', 'MERC-007', 'MERC-005'],
  },
  merchant: { id: 'MERC-068', mcc: '7802', avg_amount: 54.86 },
  terminal: { is_online: false, card_present: true, km_from_home: 952.27 },
  last_transaction: null,
});

const post = (app: ReturnType<typeof fraudScoreController>, body: unknown) =>
  app.handle(
    new Request('http://localhost/fraud-score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('POST /fraud-score', () => {
  it('exemplo fraudulento do PRD com 5 vizinhos fraud → approved=false, fraud_score=1', async () => {
    const app = fraudScoreController(buildUseCase(fraudRefs));
    const res = await post(app, buildPayload());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approved: false, fraud_score: 1 });
  });

  it('payload com formato inválido → 200 com classificação default-safe', async () => {
    // Decisão deliberada: ver fileoverview de fraud-score.ts (HTTP 500/4xx custa 5x).
    const app = fraudScoreController(buildUseCase(fraudRefs));
    const res = await post(app, { totally: 'invalid' });
    // Elysia barra antes pelo schema TypeBox — mas independente do código, a API
    // não pode quebrar. 422/200 ambos OK conforme política; aqui validamos que
    // não retorna 5xx.
    expect(res.status).toBeLessThan(500);
  });

  it('quando o índice está vazio (use case falha com NoNeighborsFound) → default-safe 200', async () => {
    const app = fraudScoreController(buildUseCase([]));
    const res = await post(app, buildPayload());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approved: true, fraud_score: 0 });
  });
});
