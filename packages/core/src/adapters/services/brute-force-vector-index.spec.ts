/**
 * @fileoverview Specs do baseline `BruteForceVectorIndex`. Funciona também como
 * **oráculo** para implementações alternativas em `packages/vector-store` (cada
 * uma deve produzir o mesmo top-K para o mesmo input determinístico).
 */

import { describe, expect, it } from 'vitest';

import type { ReferenceVector } from '../../domain/entities/reference-vector.js';
import type { FeatureVector } from '../../domain/value-objects/feature-vector.js';
import { BruteForceVectorIndex } from './brute-force-vector-index.js';

const v14 = (vals: readonly number[]): readonly number[] => {
  if (vals.length !== 14) throw new Error('helper requires length 14');
  return vals;
};

const refs: readonly ReferenceVector[] = [
  { label: 'legit', vector: v14([0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0.15, 0.006]) },
  { label: 'fraud', vector: v14([1, 1, 1, 1, 1, -1, -1, 1, 1, 0, 1, 1, 0.85, 0.5]) },
  { label: 'legit', vector: v14([0.1, 0.1, 0.1, 0.1, 0.1, -1, -1, 0.1, 0.1, 0, 1, 0, 0.2, 0.01]) },
  { label: 'fraud', vector: v14([0.9, 0.9, 0.9, 0.9, 0.9, -1, -1, 0.9, 0.9, 0, 1, 1, 0.7, 0.4]) },
  { label: 'legit', vector: v14([0.2, 0.2, 0.2, 0.2, 0.2, -1, -1, 0.2, 0.2, 0, 1, 0, 0.25, 0.02]) },
];

const idx = new BruteForceVectorIndex(refs);

describe('BruteForceVectorIndex', () => {
  it('top-3 perto do zero retorna os 3 vetores legit baixos, ordenados por distância', () => {
    const q: FeatureVector = [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0.15, 0.006];
    const r = idx.query(q, 3);
    expect(r.isOk()).toBe(true);
    const top = r.unwrap();
    expect(top.map((t) => t.label)).toEqual(['legit', 'legit', 'legit']);
    // O vetor exato deve vir primeiro.
    expect(top[0].vector).toEqual(refs[0].vector);
  });

  it('top-1 perto de [1,...,1] retorna o vetor fraud mais próximo', () => {
    const q: FeatureVector = [1, 1, 1, 1, 1, -1, -1, 1, 1, 0, 1, 1, 0.85, 0.5];
    const r = idx.query(q, 1).unwrap();
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('fraud');
  });

  it('k <= 0 retorna falha', () => {
    const q: FeatureVector = [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0];
    const r = idx.query(q, 0);
    expect(r.isFail()).toBe(true);
    expect(r.unwrapFail()._tag).toBe('VectorIndexError');
  });

  it('referência com tamanho ≠ 14 retorna falha', () => {
    const bad = new BruteForceVectorIndex([{ label: 'legit', vector: [0, 0, 0] }]);
    const q: FeatureVector = [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0];
    const r = bad.query(q, 1);
    expect(r.isFail()).toBe(true);
  });

  it('k maior que o dataset retorna o dataset inteiro', () => {
    const q: FeatureVector = [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0];
    const r = idx.query(q, 100).unwrap();
    expect(r).toHaveLength(refs.length);
  });
});
