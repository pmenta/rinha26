/**
 * @fileoverview Smoke test do bench harness — não mede performance "de
 * verdade", só garante que `runBenchSuite` produz uma snapshot válida e
 * que `summarizeLatency` está correto.
 *
 * Bench real (com `bun packages/vector-store/bench/run-bench.ts`) NÃO entra
 * na suite normal de Vitest — ela é gate de CI rápido (≤ 1s por suite).
 */

import { describe, expect, it } from 'vitest';

import { BruteForceVectorIndex } from '@rinha26/core';

import { runBenchSuite, summarizeLatency } from './measure.js';

describe('summarizeLatency()', () => {
  it('lista vazia → tudo zero', () => {
    expect(summarizeLatency([])).toEqual({
      count: 0,
      avg_ms: 0,
      min_ms: 0,
      p50_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      max_ms: 0,
    });
  });

  it('1..10 → estatísticas conhecidas', () => {
    const s = summarizeLatency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.count).toBe(10);
    expect(s.min_ms).toBe(1);
    expect(s.max_ms).toBe(10);
    expect(s.avg_ms).toBeCloseTo(5.5, 5);
    expect(s.p50_ms).toBe(5); // ceil(0.5*10)=5 → idx 4 → valor 5
    expect(s.p95_ms).toBe(10); // ceil(0.95*10)=10 → idx 9 → valor 10
    expect(s.p99_ms).toBe(10);
  });
});

describe('runBenchSuite() — smoke', () => {
  it('produz snapshot válido para o brute-force com config minúscula', () => {
    const snap = runBenchSuite(
      [
        {
          kind: 'brute-force',
          factory: (refs) => new BruteForceVectorIndex(refs),
        },
      ],
      {
        datasetSizes: [10],
        queriesPerRun: 5,
        warmupQueries: 1,
      },
    );

    expect(snap.schema_version).toBe(1);
    expect(snap.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snap.runtime.node).toMatch(/^v\d+/);
    expect(snap.results).toHaveLength(1);

    const r = snap.results[0];
    expect(r.kind).toBe('brute-force');
    expect(r.dataset_size).toBe(10);
    expect(r.queries).toBe(5);
    expect(r.build_ms).toBeGreaterThanOrEqual(0);
    expect(r.query.count).toBe(5);
    expect(r.query.max_ms).toBeGreaterThanOrEqual(r.query.min_ms);
    expect(r.heap_after_build_bytes).toBeGreaterThan(0);
  });
});
