/**
 * @fileoverview Loader do `references.bin` em runtime — zero-copy.
 *
 * Lê o arquivo inteiro como `Uint8Array` (via `Bun.file().bytes()` no
 * runtime Bun, ou `fs.readFile` em Node/Vitest), valida o header e cria
 * **views** `Int16Array` + `Uint8Array` apontando para o **mesmo
 * `ArrayBuffer`** — sem cópia, sem alocação extra.
 *
 * Para o dataset oficial (3M vetores, ~87MB), o pico de RAM durante o
 * load é **~87MB** (uma cópia única). Depois o GC pode liberar o
 * `Uint8Array` original já que mantemos `vectors`/`labels` que mantêm
 * vivo só o backing `ArrayBuffer`.
 *
 * Não usa `mmap` real (Bun não tem API estável para isso ainda) —
 * o "mmap-like" vem do fato do `ArrayBuffer` ser uma única alocação
 * contígua, residente até o fim do processo. Para datasets > 2GB
 * teríamos que adotar `mmap` real (lib externa). Não é nosso caso.
 */

import {
  type BinaryHeader,
  HEADER_SIZE,
  VECTOR_SIZE_BYTES,
  expectedFileSize,
  readHeader,
} from './binary-format.js';
import type { QuantizedDataset } from './i16-brute-force-vector-index.js';

/** Resultado do load: dataset pronto para `I16BruteForceVectorIndex.fromQuantized`. */
export interface LoadedDataset extends QuantizedDataset {
  readonly header: BinaryHeader;
  /** Tamanho total do arquivo em bytes (após validação). */
  readonly fileSizeBytes: number;
  /** Tempo gasto em I/O + parse, em ms. */
  readonly loadElapsedMs: number;
}

/** Erro do loader. */
export class BinaryLoaderError extends Error {
  override readonly name = 'BinaryLoaderError';
}

/** Forma estrutural mínima do `Bun` global (evita dep de `bun-types`). */
interface BunRuntime {
  file: (path: string) => { arrayBuffer: () => Promise<ArrayBuffer> };
}

/**
 * Lê o arquivo bruto como `Uint8Array`. Tenta `Bun.file` primeiro
 * (zero-copy quando suportado), cai em `fs/promises` para Node/Vitest.
 *
 * Acessamos `Bun` via `globalThis` com tipo estrutural para não exigir
 * `@types/bun` no tsconfig do pacote.
 */
async function readBytes(path: string): Promise<Uint8Array> {
  const bunGlobal = (globalThis as { Bun?: BunRuntime }).Bun;
  if (bunGlobal !== undefined) {
    const buf = await bunGlobal.file(path).arrayBuffer();
    return new Uint8Array(buf);
  }
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(path);
  // node `Buffer` extende `Uint8Array` mas usar a view direto pode ter
  // backing buffer maior — devolvemos uma view exata.
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Bloqueia se houver detecção de host big-endian (raro, mas defensivo). */
function assertLittleEndian(): void {
  const probe = new Uint8Array(new Uint16Array([0x0102]).buffer);
  if (probe[0] !== 0x02) {
    throw new BinaryLoaderError(
      'host big-endian detectado; este formato assume little-endian (linux/amd64)',
    );
  }
}

/**
 * Carrega `references.bin` e devolve as views typed para uso direto pelo
 * `I16BruteForceVectorIndex.fromQuantized`.
 */
export async function loadBinaryDataset(
  path: string,
): Promise<LoadedDataset> {
  assertLittleEndian();

  const t0 = performance.now();
  const bytes = await readBytes(path);
  const header = readHeader(bytes);

  const expected = expectedFileSize(header.count);
  if (bytes.byteLength !== expected) {
    throw new BinaryLoaderError(
      `tamanho do arquivo (${bytes.byteLength}) ≠ esperado (${expected}) para count=${header.count}`,
    );
  }

  const vectorsBytes = header.count * VECTOR_SIZE_BYTES;
  const vectorsOffset = bytes.byteOffset + HEADER_SIZE;
  const labelsOffset = vectorsOffset + vectorsBytes;

  // Sub-views *zero-copy* sobre o mesmo ArrayBuffer.
  // - Int16Array exige alinhamento de 2 bytes; HEADER_SIZE=32 cumpre.
  const vectors = new Int16Array(
    bytes.buffer,
    vectorsOffset,
    header.count * 14,
  );
  const labels = new Uint8Array(bytes.buffer, labelsOffset, header.count);

  const elapsed = performance.now() - t0;

  return {
    header,
    vectors,
    labels,
    count: header.count,
    scale: header.scale,
    fileSizeBytes: bytes.byteLength,
    loadElapsedMs: elapsed,
  };
}
