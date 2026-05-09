#!/usr/bin/env bun
/**
 * @fileoverview Runner do **score simulator** (camada **L12** do harness,
 * `AGENTS.md` §12.2).
 *
 * Substitui o `k6 run test/test.js` para feedback rápido durante
 * desenvolvimento — útil quando você quer iterar em uma impl de
 * `VectorIndexPort` sem precisar reconstruir docker compose + esperar k6.
 *
 * Não substitui o k6 oficial para a avaliação final (que tem ramp-up de
 * VUs e timeouts mais agressivos), mas o JSON de saída tem **mesmo schema**
 * para permitir comparação direta.
 *
 * Uso:
 *   bun apps/api/scripts/score-simulator/run.ts                   # tudo (54100 reqs)
 *   bun apps/api/scripts/score-simulator/run.ts --limit 1000      # subset rápido
 *   bun apps/api/scripts/score-simulator/run.ts --concurrency 100
 *   bun apps/api/scripts/score-simulator/run.ts --base http://localhost:9999
 *   bun apps/api/scripts/score-simulator/run.ts --out path/to/results.json
 *   bunx nx run api:simulate                                      # via Nx
 *
 * Pressuposto: a API já está rodando localmente (via `bun run src/main.ts`
 * ou `docker compose up`) na URL informada (default `http://localhost:9999`).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type Breakdown,
  type Categoria,
  type FraudScoreBody,
  classify,
  quantile,
  summarize,
} from './scoring.js';

// --------------------------------------------------------------------------- //
// CLI args                                                                     //
// --------------------------------------------------------------------------- //

interface CliArgs {
  base: string;
  limit: number | null;
  concurrency: number;
  out: string;
  data: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const here = dirname(fileURLToPath(import.meta.url));
  // here = apps/api/scripts/score-simulator
  // ../../../../  → repo root (apps/api/scripts/score-simulator → apps/api/scripts → apps/api → apps → root)
  const repoRoot = resolve(here, '..', '..', '..', '..');
  const args: CliArgs = {
    base: 'http://localhost:9999',
    limit: null,
    concurrency: 50,
    out: resolve(
      here,
      '..',
      '..',
      'test-output',
      'simulator-results.json',
    ),
    data: resolve(repoRoot, 'test', 'test-data.json'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`flag ${a} precisa de valor`);
      i += 1;
      return v;
    };
    switch (a) {
      case '--base':
        args.base = next();
        break;
      case '--limit':
        args.limit = Number.parseInt(next(), 10);
        break;
      case '--concurrency':
        args.concurrency = Number.parseInt(next(), 10);
        break;
      case '--out':
        args.out = resolve(process.cwd(), next());
        break;
      case '--data':
        args.data = resolve(process.cwd(), next());
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      // default: ignora — permite passar args extras para Nx wrappers.
    }
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(
    `score-simulator — roda test/test-data.json contra a API local\n\n` +
      `flags:\n` +
      `  --base URL          default http://localhost:9999\n` +
      `  --limit N           subset (default: todas)\n` +
      `  --concurrency N     default 50\n` +
      `  --out PATH          default apps/api/test-output/simulator-results.json\n` +
      `  --data PATH         default test/test-data.json\n`,
  );
}

// --------------------------------------------------------------------------- //
// HTTP                                                                         //
// --------------------------------------------------------------------------- //

interface ResultRow {
  readonly category: Categoria;
  readonly latency_ms: number;
}

async function postOne(
  base: string,
  request: unknown,
  expectedApproved: boolean,
): Promise<ResultRow> {
  const t0 = performance.now();
  let status = 0;
  let body: FraudScoreBody | null = null;
  try {
    const res = await fetch(`${base}/fraud-score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      // O k6 oficial tem timeout de 2001ms — replicamos.
      signal: AbortSignal.timeout(2001),
    });
    status = res.status;
    try {
      body = (await res.json()) as FraudScoreBody;
    } catch {
      body = null;
    }
  } catch {
    status = 0;
  }
  const latency = performance.now() - t0;
  return {
    category: classify(status, body, expectedApproved),
    latency_ms: latency,
  };
}

// --------------------------------------------------------------------------- //
// Pool de concorrência                                                         //
// --------------------------------------------------------------------------- //

interface DataEntry {
  readonly request: unknown;
  readonly expected_approved: boolean;
}

async function runWithPool(
  entries: readonly DataEntry[],
  concurrency: number,
  base: string,
): Promise<readonly ResultRow[]> {
  const results: ResultRow[] = new Array(entries.length);
  let nextIdx = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = nextIdx;
      nextIdx += 1;
      if (i >= entries.length) return;
      const e = entries[i];
      results[i] = await postOne(base, e.request, e.expected_approved);
      done += 1;
      // Progress a cada 5%.
      if (done % Math.max(1, Math.floor(entries.length / 20)) === 0) {
        const pct = ((done / entries.length) * 100).toFixed(1);
        process.stderr.write(`  ${done}/${entries.length} (${pct}%)\n`);
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

// --------------------------------------------------------------------------- //
// Main                                                                         //
// --------------------------------------------------------------------------- //

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  process.stderr.write(`[score-simulator] base=${args.base}\n`);
  process.stderr.write(`[score-simulator] data=${args.data}\n`);

  const raw = JSON.parse(readFileSync(args.data, 'utf-8')) as {
    entries: readonly DataEntry[];
    stats?: unknown;
  };
  const all = raw.entries;
  const slice = args.limit ? all.slice(0, args.limit) : all;
  process.stderr.write(
    `[score-simulator] entries=${slice.length}/${all.length} concurrency=${args.concurrency}\n`,
  );

  // Smoke check: GET /ready antes de começar.
  try {
    const r = await fetch(`${args.base}/ready`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) {
      process.stderr.write(
        `[score-simulator] aviso: /ready devolveu ${r.status}; resultados podem ficar enviesados (índice carregando).\n`,
      );
    }
  } catch (e) {
    process.stderr.write(
      `[score-simulator] erro: API não responde em ${args.base}/ready (${String(e)}).\n`,
    );
    process.exit(1);
  }

  const t0 = performance.now();
  const rows = await runWithPool(slice, args.concurrency, args.base);
  const elapsed = performance.now() - t0;

  // Agrega.
  const breakdown: Breakdown = { tp: 0, tn: 0, fp: 0, fn: 0, err: 0 };
  const lats: number[] = [];
  for (const r of rows) {
    switch (r.category) {
      case 'TP': (breakdown as { tp: number }).tp += 1; break;
      case 'TN': (breakdown as { tn: number }).tn += 1; break;
      case 'FP': (breakdown as { fp: number }).fp += 1; break;
      case 'FN': (breakdown as { fn: number }).fn += 1; break;
      case 'Err': (breakdown as { err: number }).err += 1; break;
    }
    lats.push(r.latency_ms);
  }
  const p99 = quantile(lats, 0.99);
  const report = summarize(breakdown, p99);

  // Output.
  mkdirSync(dirname(args.out), { recursive: true });
  const outPayload = {
    ...report,
    meta: {
      base: args.base,
      data_file: args.data,
      entries_run: slice.length,
      entries_total: all.length,
      concurrency: args.concurrency,
      elapsed_ms: Number(elapsed.toFixed(0)),
      throughput_rps: Number((slice.length / (elapsed / 1000)).toFixed(2)),
      captured_at: new Date().toISOString(),
    },
  };
  writeFileSync(args.out, `${JSON.stringify(outPayload, null, 2)}\n`);

  // Pretty print no stdout.
  const s = report.scoring;
  process.stdout.write(
    `\nfinal_score = ${s.final_score}\n` +
      `  p99_score    = ${s.p99_score.value}${s.p99_score.cut_triggered ? ' [CORTE]' : ''} (p99 = ${p99.toFixed(2)} ms)\n` +
      `  detection    = ${s.detection_score.value}${s.detection_score.cut_triggered ? ' [CORTE]' : ''}\n` +
      `  breakdown    = TP=${breakdown.tp} TN=${breakdown.tn} FP=${breakdown.fp} FN=${breakdown.fn} Err=${breakdown.err}\n` +
      `  failure_rate = ${s.failure_rate}%   (E=${s.weighted_errors_E}, ε=${s.error_rate_epsilon})\n` +
      `  elapsed      = ${(elapsed / 1000).toFixed(2)} s   (${outPayload.meta.throughput_rps} rps)\n` +
      `\nsaved → ${args.out}\n`,
  );
}

await main();
