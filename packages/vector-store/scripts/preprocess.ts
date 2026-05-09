#!/usr/bin/env bun
/**
 * @fileoverview Preprocessor — lê o `references.json.gz` oficial (3M
 * vetores) e produz o `references.bin` (i16 quantizado) que o
 * `apps/api` carrega via `loadBinaryDataset()` em runtime.
 *
 * Roda no **build** do Docker (não em runtime), depois embute o `.bin`
 * na imagem final. Sem custo no hot path.
 *
 * Uso:
 *   bun packages/vector-store/scripts/preprocess.ts
 *   bun packages/vector-store/scripts/preprocess.ts \
 *     --input  resources/references.json.gz \
 *     --output resources/references.bin
 *   bunx nx run vector-store:preprocess        # via Nx (mesma coisa)
 */

import { gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HEADER_SIZE,
  LABEL_FRAUD,
  LABEL_LEGIT,
  expectedFileSize,
  writeHeader,
} from '../src/i16/binary-format.js';
import {
  I16_SCALE,
  quantizeFeatureVectorInto,
} from '../src/i16/quantize.js';

interface CliArgs {
  input: string;
  output: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const here = dirname(fileURLToPath(import.meta.url));
  // here = packages/vector-store/scripts
  const repoRoot = resolve(here, '..', '..', '..');
  const args: CliArgs = {
    input: resolve(repoRoot, 'resources', 'references.json.gz'),
    output: resolve(repoRoot, 'resources', 'references.bin'),
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
      case '--input':
        args.input = resolve(process.cwd(), next());
        break;
      case '--output':
        args.output = resolve(process.cwd(), next());
        break;
      case '-h':
      case '--help':
        process.stdout.write(
          `preprocess — references.json.gz → references.bin (i16 quantizado)\n\n` +
            `flags:\n` +
            `  --input  PATH    default resources/references.json.gz\n` +
            `  --output PATH    default resources/references.bin\n`,
        );
        process.exit(0);
    }
  }
  return args;
}

interface RawEntry {
  vector: readonly number[];
  label: 'fraud' | 'legit';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  process.stderr.write(`[preprocess] input=${args.input}\n`);
  process.stderr.write(`[preprocess] output=${args.output}\n`);
  process.stderr.write(`[preprocess] scale=${I16_SCALE}\n`);

  // 1. Lê + descomprime + parse JSON.
  const t0 = performance.now();
  const buf = readFileSync(args.input);
  const isGz = args.input.endsWith('.gz');
  const text = (isGz ? gunzipSync(buf) : buf).toString('utf-8');
  const entries = JSON.parse(text) as readonly RawEntry[];
  const t1 = performance.now();
  process.stderr.write(
    `[preprocess] read+parse: ${entries.length.toLocaleString()} entries in ${(t1 - t0).toFixed(0)}ms\n`,
  );

  // 2. Aloca o buffer final e escreve header.
  const count = entries.length;
  const out = new Uint8Array(expectedFileSize(count));
  writeHeader(out, { version: 1, count, dim: 14, scale: I16_SCALE });

  // 3. Quantiza vetores (zero-copy via view Int16Array) + grava labels.
  const vectorsView = new Int16Array(out.buffer, HEADER_SIZE, count * 14);
  const labelsOffset = HEADER_SIZE + count * 28;

  let fraudCount = 0;
  let legitCount = 0;
  for (let i = 0; i < count; i += 1) {
    const e = entries[i];
    if (e.vector.length !== 14) {
      throw new Error(
        `[preprocess] entry[${i}].vector.length=${e.vector.length}, esperado 14`,
      );
    }
    quantizeFeatureVectorInto(e.vector, vectorsView, i * 14);
    if (e.label === 'fraud') {
      out[labelsOffset + i] = LABEL_FRAUD;
      fraudCount += 1;
    } else if (e.label === 'legit') {
      out[labelsOffset + i] = LABEL_LEGIT;
      legitCount += 1;
    } else {
      throw new Error(`[preprocess] entry[${i}].label=${String(e.label)} desconhecido`);
    }
  }

  const t2 = performance.now();
  process.stderr.write(
    `[preprocess] quantize:   ${count.toLocaleString()} vectors in ${(t2 - t1).toFixed(0)}ms\n`,
  );
  process.stderr.write(
    `[preprocess] labels:     fraud=${fraudCount.toLocaleString()} legit=${legitCount.toLocaleString()}\n`,
  );

  // 4. Escreve o arquivo final.
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, out);
  const t3 = performance.now();
  const mb = (out.byteLength / 1024 / 1024).toFixed(2);
  process.stderr.write(
    `[preprocess] write:      ${out.byteLength.toLocaleString()}B (${mb} MB) in ${(t3 - t2).toFixed(0)}ms\n`,
  );
  process.stdout.write(
    `done → ${args.output} (${mb} MB, ${count.toLocaleString()} vectors, ` +
      `${fraudCount.toLocaleString()} fraud / ${legitCount.toLocaleString()} legit, ` +
      `${(t3 - t0).toFixed(0)}ms total)\n`,
  );
}

await main();
