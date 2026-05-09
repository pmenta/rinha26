/**
 * @fileoverview Spec do `ScoreTransactionUseCase` — happy path completo orquestrando
 * fakes do próprio `core` (vetorização + KNN + decisão).
 */

import { describe, expect, it } from 'vitest';

import { OFFICIAL_MCC_RISK, OFFICIAL_NORMALIZATION } from '../../__fixtures__/index.js';
import { BruteForceVectorIndex } from '../../adapters/services/brute-force-vector-index.js';
import { FakeMccRiskTable } from '../../adapters/services/fake-mcc-risk.js';
import { StaticNormalizationConfig } from '../../adapters/services/static-normalization-config.js';
import type { ReferenceVector } from '../../domain/entities/reference-vector.js';
import { vectorize } from '../../domain/policies/vectorize.js';
import type { FeatureVector } from '../../domain/value-objects/feature-vector.js';

import type { ScoreTransactionInput } from './score-transaction.input.js';
import { ScoreTransactionUseCase } from './score-transaction.use-case.js';

const mccLookup = new FakeMccRiskTable(OFFICIAL_MCC_RISK);

const buildIndex = (entries: readonly ReferenceVector[]) => new BruteForceVectorIndex(entries);

describe('ScoreTransactionUseCase', () => {
  // Dataset com 5 vetores; o "alvo" da query será exatamente o vetor [1,...,1] →
  // os 5 vizinhos mais próximos serão majoritariamente fraud.
  const fraudCluster: readonly ReferenceVector[] = Array.from({ length: 5 }, (_, i) => ({
    label: 'fraud' as const,
    vector: [1, 1, 1, 1, 1, -1, -1, 1, 1, 0, 1, 1, 0.85, 0.5].map(
      (x) => x - i * 1e-4,
    ) as readonly number[],
  }));

  const legitCluster: readonly ReferenceVector[] = Array.from({ length: 5 }, (_, i) => ({
    label: 'legit' as const,
    vector: [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0.15, 0.006].map(
      (x) => x + i * 1e-4,
    ) as readonly number[],
  }));

  const fraudInput: ScoreTransactionInput = {
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
  };

  const legitInput: ScoreTransactionInput = {
    id: 'tx-1329056812',
    transaction: { amount: 41.12, installments: 2, requested_at: '2026-03-11T18:45:53Z' },
    customer: {
      avg_amount: 82.24,
      tx_count_24h: 3,
      known_merchants: ['MERC-003', 'MERC-016'],
    },
    merchant: { id: 'MERC-016', mcc: '5411', avg_amount: 60.25 },
    terminal: { is_online: false, card_present: true, km_from_home: 29.23 },
    last_transaction: null,
  };

  it('caso fraud do PRD: dataset com 5 fraud-vizinhos → score=1, approved=false', () => {
    const useCase = new ScoreTransactionUseCase({
      normalization: new StaticNormalizationConfig(OFFICIAL_NORMALIZATION),
      mccRisk: mccLookup,
      vectorIndex: buildIndex([...fraudCluster, ...legitCluster]),
    });

    const r = useCase.execute(fraudInput);
    expect(r.isOk()).toBe(true);
    expect(r.unwrap()).toEqual({ approved: false, fraud_score: 1 });
  });

  it('caso legit do PRD: dataset com 5 legit-vizinhos → score=0, approved=true', () => {
    const useCase = new ScoreTransactionUseCase({
      normalization: new StaticNormalizationConfig(OFFICIAL_NORMALIZATION),
      mccRisk: mccLookup,
      vectorIndex: buildIndex([...legitCluster, ...fraudCluster]),
    });

    const r = useCase.execute(legitInput);
    expect(r.isOk()).toBe(true);
    expect(r.unwrap()).toEqual({ approved: true, fraud_score: 0 });
  });

  it('vetor query final passado ao índice é igual ao vetorize() puro', () => {
    let observed: FeatureVector | null = null;
    const useCase = new ScoreTransactionUseCase({
      normalization: new StaticNormalizationConfig(OFFICIAL_NORMALIZATION),
      mccRisk: mccLookup,
      vectorIndex: {
        query: (q) => {
          observed = q;
          return buildIndex(legitCluster).query(q, 5);
        },
      },
    });
    useCase.execute(legitInput);

    const expected = vectorize(legitInput, OFFICIAL_NORMALIZATION, (mcc) =>
      mccLookup.lookup(mcc),
    );
    expect(observed).toEqual(expected);
  });

  it('quando o índice retorna lista vazia, falha com NoNeighborsFound', () => {
    const useCase = new ScoreTransactionUseCase({
      normalization: new StaticNormalizationConfig(OFFICIAL_NORMALIZATION),
      mccRisk: mccLookup,
      vectorIndex: buildIndex([]),
    });
    const r = useCase.execute(legitInput);
    expect(r.isFail()).toBe(true);
    expect(r.unwrapFail()._tag).toBe('NoNeighborsFound');
  });
});
