/**
 * @fileoverview Specs específicas do {@link I16BruteForceVectorIndex} —
 * cobre o caminho `fromQuantized` (que o contract não exercita por ter
 * assinatura diferente) e o caso onde a query devolve `ReferenceVector`
 * dequantizado.
 */

import { describe, expect, it } from 'vitest';

import type { ReferenceVector } from '@rinha26/core';

import { LABEL_FRAUD, LABEL_LEGIT } from './binary-format.js';
import { I16BruteForceVectorIndex } from './i16-brute-force-vector-index.js';
import { quantizeFeatureVectorInto } from './quantize.js';

describe('I16BruteForceVectorIndex.fromQuantized()', () => {
  // Dataset minúsculo: 3 vetores quantizados manualmente.
  const buildDataset = () => {
    const vectors = new Int16Array(3 * 14);
    quantizeFeatureVectorInto(
      [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0.15, 0.006],
      vectors,
      0,
    );
    quantizeFeatureVectorInto(
      [0.5, 0.5, 0.5, 0.5, 0.5, -1, -1, 0.5, 0.5, 0, 1, 0, 0.5, 0.1],
      vectors,
      14,
    );
    quantizeFeatureVectorInto(
      [1, 1, 1, 1, 1, -1, -1, 1, 1, 0, 1, 1, 0.85, 0.5],
      vectors,
      28,
    );
    const labels = new Uint8Array([LABEL_LEGIT, LABEL_LEGIT, LABEL_FRAUD]);
    return { vectors, labels, count: 3 };
  };

  it('top-1 perto de [0,...,0] devolve o vetor 0 (legit)', () => {
    const idx = I16BruteForceVectorIndex.fromQuantized(buildDataset());
    const r = idx
      .query(
        [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0.15, 0.006],
        1,
      )
      .unwrap();
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('legit');
    // Vetor reconstruído por dequantização (≈ original).
    expect(r[0].vector[0]).toBeCloseTo(0, 4);
    expect(r[0].vector[5]).toBeCloseTo(-1, 4);
  });

  it('top-1 perto de [1,...,1] devolve o vetor 2 (fraud)', () => {
    const idx = I16BruteForceVectorIndex.fromQuantized(buildDataset());
    const r = idx
      .query([1, 1, 1, 1, 1, -1, -1, 1, 1, 0, 1, 1, 0.85, 0.5], 1)
      .unwrap();
    expect(r[0].label).toBe('fraud');
  });

  it('rejeita quando vectors.length não bate com count*14', () => {
    expect(() =>
      I16BruteForceVectorIndex.fromQuantized({
        vectors: new Int16Array(13), // < 14
        labels: new Uint8Array(1),
        count: 1,
      }),
    ).toThrow(/vectors\.length=13/);
  });

  it('rejeita quando labels.length não bate com count', () => {
    expect(() =>
      I16BruteForceVectorIndex.fromQuantized({
        vectors: new Int16Array(14),
        labels: new Uint8Array(2),
        count: 1,
      }),
    ).toThrow(/labels\.length=2/);
  });
});

describe('I16BruteForceVectorIndex.fromReferenceVectors()', () => {
  it('rejeita ref com vector.length ≠ 14 (eager no construtor)', () => {
    const bad: readonly ReferenceVector[] = [
      { label: 'legit', vector: [0, 0, 0] },
    ];
    expect(() => I16BruteForceVectorIndex.fromReferenceVectors(bad)).toThrow(
      /reference\[0\]/,
    );
  });

  it('quando fonte é ReferenceVector[], top-K devolve referências originais bit-a-bit', () => {
    const refs: readonly ReferenceVector[] = [
      {
        label: 'legit',
        vector: [0.123456, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0],
      },
      {
        label: 'fraud',
        vector: [0.987654, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0],
      },
    ];
    const idx = I16BruteForceVectorIndex.fromReferenceVectors(refs);
    const r = idx
      .query([0.1, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0], 1)
      .unwrap();
    // Bit-a-bit: a referência devolvida É exatamente a do array original
    // (não dequantizada).
    expect(r[0]).toBe(refs[0]);
    expect(r[0].vector[0]).toBe(0.123456);
  });
});
