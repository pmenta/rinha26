/**
 * @fileoverview Specs da policy `decide`. Cobertura das fórmulas oficiais em
 * `docs/REGRAS_DE_DETECCAO.md` §"Como a decisão é tomada".
 */

import { describe, expect, it } from 'vitest';

import type { ReferenceVector } from '../entities/reference-vector.js';
import { decide, FRAUD_THRESHOLD, KNN_K } from './decide.js';

const ref = (label: 'fraud' | 'legit'): ReferenceVector => ({
  vector: new Array(14).fill(0),
  label,
});

describe('decide()', () => {
  it('5 legit → fraud_score=0, approved=true', () => {
    const r = decide([ref('legit'), ref('legit'), ref('legit'), ref('legit'), ref('legit')]);
    expect(r).toEqual({ approved: true, fraud_score: 0 });
  });

  it('5 fraud → fraud_score=1, approved=false', () => {
    const r = decide([ref('fraud'), ref('fraud'), ref('fraud'), ref('fraud'), ref('fraud')]);
    expect(r).toEqual({ approved: false, fraud_score: 1 });
  });

  it('2 fraud em 5 → 0.4 < threshold (0.6) → approved=true', () => {
    const r = decide([ref('fraud'), ref('fraud'), ref('legit'), ref('legit'), ref('legit')]);
    expect(r.fraud_score).toBeCloseTo(0.4, 5);
    expect(r.approved).toBe(true);
  });

  it('3 fraud em 5 → 0.6 NÃO é < 0.6 → approved=false', () => {
    const r = decide([ref('fraud'), ref('fraud'), ref('fraud'), ref('legit'), ref('legit')]);
    expect(r.fraud_score).toBeCloseTo(0.6, 5);
    expect(r.approved).toBe(false);
  });

  it('lista vazia → score 0, approved=true (defensivo)', () => {
    expect(decide([])).toEqual({ approved: true, fraud_score: 0 });
  });

  it('threshold custom 0.5 com 2 fraudes em 4 (=0.5) → NÃO < 0.5 → approved=false', () => {
    const r = decide([ref('fraud'), ref('fraud'), ref('legit'), ref('legit')], 0.5);
    expect(r).toEqual({ approved: false, fraud_score: 0.5 });
  });

  it('constantes da regra do desafio', () => {
    expect(KNN_K).toBe(5);
    expect(FRAUD_THRESHOLD).toBe(0.6);
  });
});
