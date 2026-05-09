/**
 * @fileoverview Núcleo do bench harness — funções puras de medição que podem
 * ser reutilizadas pelo runner CLI (`run-bench.ts`) e por specs leves
 * (`measure.spec.ts`).
 *
 * Sem dep externa — usa só `performance.now()` e `process.memoryUsage()`. O
 * design favorece reprodutibilidade (queries determinísticas) e comparação
 * entre runs (JSON estruturado).
 *
 * Inspiração: `AGENTS.md` §12.2 camada **L11**.
 */

import {
  type FeatureVector,
  type ReferenceVector,
  type VectorIndexPort,
} from '@rinha26/core';

import {
  buildDeterministicDataset,
  buildDeterministicQuery,
} from '../src/__contracts__/synthetic-dataset.js';

// --------------------------------------------------------------------------- //
// Tipos                                                                        //
// --------------------------------------------------------------------------- //

/** Estatísticas de latência (em ms). */
export interface LatencyStats {
  readonly count: number;
  readonly avg_ms: number;
  readonly min_ms: number;
  readonly p50_ms: number;
  readonly p95_ms: number;
  readonly p99_ms: number;
  readonly max_ms: number;
}

/** Resultado de um bench (uma combinação `kind` × `dataset_size`). */
export interface BenchResult {
  /** Identificador da implementação (ex.: 'brute-force', 'kd-tree'). */
  readonly kind: string;
  /** Número de vetores no dataset. */
  readonly dataset_size: number;
  /** Quantas queries foram medidas. */
  readonly queries: number;
  /** Tempo de build do índice (1 amostra). */
  readonly build_ms: number;
  /** Estatísticas das queries. */
  readonly query: LatencyStats;
  /** Bytes de heap usados pelo processo após o build. Aproximação grossa. */
  readonly heap_after_build_bytes: number;
}

/** Snapshot completo de um run (várias combinações). */
export interface BenchSnapshot {
  readonly schema_version: 1;
  readonly captured_at: string;
  readonly runtime: { readonly bun?: string; readonly node: string; readonly platform: string; readonly arch: string };
  readonly results: readonly BenchResult[];
}

/** Configuração de uma execução. */
export interface BenchConfig {
  /** Conjunto de tamanhos de dataset a medir. Default `[100, 1_000, 10_000]`. */
  readonly datasetSizes?: readonly number[];
  /** Quantas queries por combinação. Default `100`. */
  readonly queriesPerRun?: number;
  /** Quantas queries de warmup antes de começar a medir. Default `5`. */
  readonly warmupQueries?: number;
  /** `k` do KNN. Default `5` (regra do desafio). */
  readonly k?: number;
  /** Seed para o dataset determinístico. Default `42`. */
  readonly datasetSeed?: number;
  /** Seed inicial das queries (cada query usa `querySeedBase + i`). Default `1000`. */
  readonly querySeedBase?: number;
}

/** Implementação que será medida. */
export interface BenchTarget {
  readonly kind: string;
  /** Fábrica do índice. Recebe os refs já construídos. */
  readonly factory: (refs: readonly ReferenceVector[]) => VectorIndexPort;
}

// --------------------------------------------------------------------------- //
// Utilitários                                                                  //
// --------------------------------------------------------------------------- //

/** Computa estatísticas de latência. Não usa lib externa. */
export function summarizeLatency(samplesMs: readonly number[]): LatencyStats {
  const n = samplesMs.length;
  if (n === 0) {
    return {
      count: 0,
      avg_ms: 0,
      min_ms: 0,
      p50_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      max_ms: 0,
    };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  // Quantil "nearest-rank" (suficiente para nosso uso; coerente com k6).
  const at = (q: number): number => {
    const rank = Math.max(0, Math.min(n - 1, Math.ceil(q * n) - 1));
    return sorted[rank];
  };
  return {
    count: n,
    avg_ms: sum / n,
    min_ms: sorted[0],
    p50_ms: at(0.5),
    p95_ms: at(0.95),
    p99_ms: at(0.99),
    max_ms: sorted[n - 1],
  };
}

// --------------------------------------------------------------------------- //
// Execução                                                                     //
// --------------------------------------------------------------------------- //

/**
 * Roda **uma** combinação `target × datasetSize` e devolve o {@link BenchResult}.
 * Não toca em I/O — toda saída é via valor de retorno.
 */
export function runBench(
  target: BenchTarget,
  datasetSize: number,
  config: Required<Omit<BenchConfig, 'datasetSizes'>>,
): BenchResult {
  const refs = buildDeterministicDataset({
    size: datasetSize,
    seed: config.datasetSeed,
  });

  const t0 = performance.now();
  const index = target.factory(refs);
  const t1 = performance.now();
  const buildMs = t1 - t0;

  const heapAfterBuild = process.memoryUsage().heapUsed;

  // Pré-construímos as queries (fora do loop medido).
  const queries: FeatureVector[] = new Array(
    config.queriesPerRun + config.warmupQueries,
  );
  for (let i = 0; i < queries.length; i += 1) {
    queries[i] = buildDeterministicQuery(
      config.querySeedBase + i,
    ) as unknown as FeatureVector;
  }

  // Warmup (não medido).
  for (let i = 0; i < config.warmupQueries; i += 1) {
    index.query(queries[i], config.k);
  }

  // Medição.
  const samples: number[] = new Array(config.queriesPerRun);
  for (let i = 0; i < config.queriesPerRun; i += 1) {
    const q = queries[config.warmupQueries + i];
    const t = performance.now();
    index.query(q, config.k);
    samples[i] = performance.now() - t;
  }

  return {
    kind: target.kind,
    dataset_size: datasetSize,
    queries: config.queriesPerRun,
    build_ms: buildMs,
    query: summarizeLatency(samples),
    heap_after_build_bytes: heapAfterBuild,
  };
}

/**
 * Roda todas as combinações `targets × datasetSizes` e compõe o
 * {@link BenchSnapshot} pronto para ser serializado em JSON.
 */
export function runBenchSuite(
  targets: readonly BenchTarget[],
  config: BenchConfig = {},
): BenchSnapshot {
  const cfg: Required<Omit<BenchConfig, 'datasetSizes'>> = {
    queriesPerRun: config.queriesPerRun ?? 100,
    warmupQueries: config.warmupQueries ?? 5,
    k: config.k ?? 5,
    datasetSeed: config.datasetSeed ?? 42,
    querySeedBase: config.querySeedBase ?? 1000,
  };
  const sizes = config.datasetSizes ?? [100, 1_000, 10_000];

  const results: BenchResult[] = [];
  for (const target of targets) {
    for (const size of sizes) {
      results.push(runBench(target, size, cfg));
    }
  }

  return {
    schema_version: 1,
    captured_at: new Date().toISOString(),
    runtime: {
      // `process.versions.bun` é setado pelo Bun runtime; `undefined` em Node
      // (Vitest), o que mantém o tipo livre de declarações de tipo do Bun.
      bun: process.versions.bun,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    results,
  };
}
