#!/usr/bin/env bun
/**
 * @fileoverview Runner CLI do bench harness. Executa
 * `runBenchSuite([brute-force], default config)` e grava o JSON em
 * `bench-results/<timestamp>.json` + atualiza um symlink `latest.json`.
 *
 * Uso:
 *   bun packages/vector-store/bench/run-bench.ts
 *   bunx nx run vector-store:bench   # via Nx target (mesma coisa)
 *
 * Output:
 *   - stdout: pretty summary (markdown table) — fácil de copiar pra PR.
 *   - file:   bench-results/<timestamp>.json e latest.json (symlink).
 *
 * Por que symlink? Permite `git diff` rápido entre PR e main: o CI compara
 * `latest.json` da branch atual com `latest.json` da main e falha se houver
 * regressão > N% (camada **L14** futura, `AGENTS.md` §12.2).
 */

import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BruteForceVectorIndex } from '@rinha26/core';

import { I16BruteForceVectorIndex } from '../src/i16/i16-brute-force-vector-index.js';
import {
  type BenchSnapshot,
  type BenchTarget,
  runBenchSuite,
} from './measure.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'bench-results');

function safeSymlink(target: string, linkPath: string): void {
  try {
    unlinkSync(linkPath);
  } catch {
    // ignore
  }
  // Symlink relativo para sobreviver a clones em outras paths.
  symlinkSync(relative(dirname(linkPath), target), linkPath);
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function renderMarkdown(snapshot: BenchSnapshot): string {
  const lines: string[] = [];
  lines.push(
    `# Bench results — ${snapshot.captured_at}`,
    '',
    `Runtime: bun=${snapshot.runtime.bun ?? '-'} node=${snapshot.runtime.node} ${snapshot.runtime.platform}/${snapshot.runtime.arch}`,
    '',
    '| kind | N | build_ms | q.avg | q.p50 | q.p95 | q.p99 | q.max | heap |',
    '|------|---:|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const r of snapshot.results) {
    lines.push(
      `| ${r.kind} | ${r.dataset_size} | ` +
        `${r.build_ms.toFixed(2)} | ` +
        `${r.query.avg_ms.toFixed(3)} | ${r.query.p50_ms.toFixed(3)} | ` +
        `${r.query.p95_ms.toFixed(3)} | ${r.query.p99_ms.toFixed(3)} | ` +
        `${r.query.max_ms.toFixed(3)} | ` +
        `${formatBytes(r.heap_after_build_bytes)} |`,
    );
  }
  return lines.join('\n');
}

// --------------------------------------------------------------------------- //
// Config + execução                                                            //
// --------------------------------------------------------------------------- //

const targets: readonly BenchTarget[] = [
  {
    kind: 'brute-force',
    factory: (refs) => new BruteForceVectorIndex(refs),
  },
  {
    kind: 'i16-brute-force',
    factory: (refs) => I16BruteForceVectorIndex.fromReferenceVectors(refs),
  },
  // Futuras impls: { kind: 'vp-tree', factory: (refs) => new VpTreeIndex(refs) }, …
];

const snapshot = runBenchSuite(targets, {
  // Defaults: N ∈ [100, 1000, 10000], 100 queries por combinação.
  // Para CI rápido, sobrescrever via env BENCH_QUERIES_PER_RUN ou similar
  // (a implementar quando precisar).
});

mkdirSync(outDir, { recursive: true });
const tsSlug = snapshot.captured_at.replace(/[:.]/g, '-');
const jsonPath = join(outDir, `${tsSlug}.json`);
writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`);
safeSymlink(jsonPath, join(outDir, 'latest.json'));

// stdout: markdown — copiável pra PR/issue.
process.stdout.write(`${renderMarkdown(snapshot)}\n\n`);
process.stdout.write(`saved → ${relative(process.cwd(), jsonPath)}\n`);
process.stdout.write(
  `latest → ${relative(process.cwd(), join(outDir, 'latest.json'))}\n`,
);
