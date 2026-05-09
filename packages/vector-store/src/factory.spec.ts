/**
 * @fileoverview Spec mínimo de `createVectorIndex`: confirma que `brute-force`
 * devolve um `VectorIndexPort` consultável e que kinds não-implementados lançam
 * erro descritivo.
 */

import { describe, expect, it } from 'vitest';

import type { ReferenceVector } from '@rinha26/core';

import { createVectorIndex } from './factory.js';

const refs: readonly ReferenceVector[] = [
  { label: 'legit', vector: [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0.15, 0.006] },
];

describe('createVectorIndex()', () => {
  it("kind='brute-force' devolve um índice consultável", () => {
    const idx = createVectorIndex('brute-force', refs);
    const r = idx.query(
      [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0.15, 0.006],
      1,
    );
    expect(r.isOk()).toBe(true);
    expect(r.unwrap()).toHaveLength(1);
  });

  it("kinds não implementados lançam erro descritivo", () => {
    expect(() => createVectorIndex('hnsw', refs)).toThrowError(/Fase 5/);
    expect(() => createVectorIndex('kd-tree', refs)).toThrowError(/Fase 5/);
    expect(() => createVectorIndex('vp-tree', refs)).toThrowError(/Fase 5/);
  });
});
