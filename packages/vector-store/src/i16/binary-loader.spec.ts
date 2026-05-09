/**
 * @fileoverview Specs do loader binário — usa um arquivo temporário
 * gerado em runtime (sem depender do dataset oficial nem do preprocessor).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  HEADER_SIZE,
  LABEL_FRAUD,
  LABEL_LEGIT,
  expectedFileSize,
  writeHeader,
} from './binary-format.js';
import {
  BinaryLoaderError,
  loadBinaryDataset,
} from './binary-loader.js';
import { quantizeFeatureVectorInto } from './quantize.js';

describe('loadBinaryDataset()', () => {
  let tmpDir: string;
  let validPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rinha26-loader-spec-'));

    // Constrói um arquivo válido com 3 vetores manualmente.
    const count = 3;
    const buf = new Uint8Array(expectedFileSize(count));
    writeHeader(buf, { version: 1, count, dim: 14, scale: 8192 });

    const vectorsView = new Int16Array(buf.buffer, HEADER_SIZE, count * 14);
    quantizeFeatureVectorInto(
      [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0.15, 0.006],
      vectorsView,
      0,
    );
    quantizeFeatureVectorInto(
      [0.5, 0.5, 0.5, 0.5, 0.5, -1, -1, 0.5, 0.5, 0, 1, 0, 0.5, 0.1],
      vectorsView,
      14,
    );
    quantizeFeatureVectorInto(
      [1, 1, 1, 1, 1, -1, -1, 1, 1, 0, 1, 1, 0.85, 0.5],
      vectorsView,
      28,
    );

    const labelsOffset = HEADER_SIZE + count * 28;
    buf[labelsOffset + 0] = LABEL_LEGIT;
    buf[labelsOffset + 1] = LABEL_LEGIT;
    buf[labelsOffset + 2] = LABEL_FRAUD;

    validPath = join(tmpDir, 'valid.bin');
    writeFileSync(validPath, buf);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('carrega e expõe header + views typed corretas', async () => {
    const ds = await loadBinaryDataset(validPath);
    expect(ds.header).toEqual({ version: 1, count: 3, dim: 14, scale: 8192 });
    expect(ds.count).toBe(3);
    expect(ds.scale).toBe(8192);
    expect(ds.vectors.length).toBe(3 * 14);
    expect(ds.labels.length).toBe(3);
    expect(ds.fileSizeBytes).toBe(expectedFileSize(3));
    expect(ds.loadElapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('vectors view é Int16Array com valores quantizados (escala 8192)', async () => {
    const ds = await loadBinaryDataset(validPath);
    // vetor 0: [0, 0, ..., -1 em 5/6, ..., 0.15 em 12, ...]
    expect(ds.vectors[0]).toBe(0);
    expect(ds.vectors[5]).toBe(-8192); // sentinela
    expect(ds.vectors[6]).toBe(-8192);
    expect(ds.vectors[12]).toBe(Math.round(0.15 * 8192));
    // vetor 2: [1, 1, ...]
    expect(ds.vectors[28 + 0]).toBe(8192);
  });

  it('labels view é Uint8Array com bytes corretos', async () => {
    const ds = await loadBinaryDataset(validPath);
    expect(ds.labels[0]).toBe(LABEL_LEGIT);
    expect(ds.labels[1]).toBe(LABEL_LEGIT);
    expect(ds.labels[2]).toBe(LABEL_FRAUD);
  });

  it('falha em arquivo com tamanho inconsistente com count do header', async () => {
    // Arquivo com header válido (count=10) mas só 3 vetores de body.
    const malformed = new Uint8Array(HEADER_SIZE + 3 * 28 + 3); // count=3 no body
    writeHeader(malformed, { version: 1, count: 10, dim: 14, scale: 8192 }); // mente count=10
    const path = join(tmpDir, 'bad-size.bin');
    writeFileSync(path, malformed);
    await expect(loadBinaryDataset(path)).rejects.toBeInstanceOf(
      BinaryLoaderError,
    );
  });
});
