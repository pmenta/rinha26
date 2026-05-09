/**
 * @fileoverview Formato binário do dataset quantizado (`references.bin`).
 *
 * **Layout** (little-endian, host = linux/amd64):
 *
 * ```
 *  offset  size   campo                    descrição
 *  ------  -----  -----------------------  --------------------------------
 *  0       4      magic                    "R26V" (0x52 0x32 0x36 0x56)
 *  4       4      version: u32             1
 *  8       4      count:   u32             número de vetores (ex.: 3_000_000)
 *  12      4      dim:     u32             dimensões (sempre 14)
 *  16      4      scale:   f32             escala da quantização (= 8192.0)
 *  20      12     reserved                 zero-fill, alinha header em 32B
 *  32      28×N   vectors[count][dim]      i16 little-endian, contíguos
 *  32+28N  N      labels[count]            u8: 'F' (0x46) = fraud, 'L' (0x4C) = legit
 * ```
 *
 * **Por que 32 bytes de header?** Alinhamento — os blocos de vetores começam
 * em `offset 32`, divisível por 32 (= largura de uma linha AVX2 / 4 linhas
 * de cache L1 de 8 bytes). Útil quando portarmos para WASM SIMD / FFI.
 *
 * **Por que labels separados (em vez de inline por vetor)?** Cache locality
 * do hot path: a query KNN só precisa do bloco de vetores; só consulta
 * labels para os top-K vencedores (≤ 5). Manter labels num "stream" separado
 * evita carregar 1 byte sujo em cada linha de cache de 28 bytes.
 *
 * **Endianness**: assumimos little-endian. Asseguramos no loader. Se um
 * dia rodar num runtime BE (raro), precisará ler com `DataView`.
 */

/** Magic bytes do formato. */
export const MAGIC_BYTES: Readonly<[number, number, number, number]> =
  [0x52, 0x32, 0x36, 0x56] as const; // "R26V"

/** Versão atual do formato. Bump em qualquer mudança breaking. */
export const FORMAT_VERSION = 1 as const;

/** Tamanho do header em bytes. Vetores começam neste offset. */
export const HEADER_SIZE = 32 as const;

/** Tamanho de cada vetor quantizado (14 i16 = 28 bytes). */
export const VECTOR_SIZE_BYTES = 14 * 2; // = 28

/** Bytes do label `'fraud'` (= ASCII 'F'). */
export const LABEL_FRAUD = 0x46 as const; // 'F'
/** Bytes do label `'legit'` (= ASCII 'L'). */
export const LABEL_LEGIT = 0x4c as const; // 'L'

/** Header decodificado. */
export interface BinaryHeader {
  readonly version: number;
  readonly count: number;
  readonly dim: number;
  readonly scale: number;
}

/** Erro do formato (magic inválido, versão errada, dim ≠ 14, etc.). */
export class BinaryFormatError extends Error {
  override readonly name = 'BinaryFormatError';
}

/**
 * Escreve o header em `target` a partir de `offset` (default 0). Faz
 * little-endian explícito via `DataView` para garantir portabilidade.
 *
 * @returns offset depois do header (= 32 + offset).
 */
export function writeHeader(
  target: Uint8Array,
  header: BinaryHeader,
  offset = 0,
): number {
  if (target.byteLength - offset < HEADER_SIZE) {
    throw new BinaryFormatError(
      `target tem ${target.byteLength - offset} bytes; header pede ${HEADER_SIZE}`,
    );
  }
  target[offset + 0] = MAGIC_BYTES[0];
  target[offset + 1] = MAGIC_BYTES[1];
  target[offset + 2] = MAGIC_BYTES[2];
  target[offset + 3] = MAGIC_BYTES[3];
  const dv = new DataView(target.buffer, target.byteOffset + offset, HEADER_SIZE);
  dv.setUint32(4, header.version, true);
  dv.setUint32(8, header.count, true);
  dv.setUint32(12, header.dim, true);
  dv.setFloat32(16, header.scale, true);
  // 20..31 já são zero (Uint8Array vem zerado).
  return offset + HEADER_SIZE;
}

/**
 * Lê o header de `source` a partir de `offset` (default 0) e valida:
 * magic, versão suportada, `dim === 14`.
 */
export function readHeader(source: Uint8Array, offset = 0): BinaryHeader {
  if (source.byteLength - offset < HEADER_SIZE) {
    throw new BinaryFormatError(
      `arquivo tem ${source.byteLength - offset} bytes; precisa pelo menos ${HEADER_SIZE} para o header`,
    );
  }
  if (
    source[offset + 0] !== MAGIC_BYTES[0] ||
    source[offset + 1] !== MAGIC_BYTES[1] ||
    source[offset + 2] !== MAGIC_BYTES[2] ||
    source[offset + 3] !== MAGIC_BYTES[3]
  ) {
    throw new BinaryFormatError(
      `magic bytes inválidos (esperado "R26V")`,
    );
  }
  const dv = new DataView(source.buffer, source.byteOffset + offset, HEADER_SIZE);
  const header: BinaryHeader = {
    version: dv.getUint32(4, true),
    count: dv.getUint32(8, true),
    dim: dv.getUint32(12, true),
    scale: dv.getFloat32(16, true),
  };
  if (header.version !== FORMAT_VERSION) {
    throw new BinaryFormatError(
      `versão ${header.version} não suportada (esperado ${FORMAT_VERSION})`,
    );
  }
  if (header.dim !== 14) {
    throw new BinaryFormatError(
      `dim ${header.dim} ≠ 14 (não suportado neste pacote)`,
    );
  }
  return header;
}

/**
 * Calcula o tamanho total esperado de um arquivo com `count` vetores de
 * dimensão 14, escala fixa, sem padding entre vetores e labels.
 */
export function expectedFileSize(count: number): number {
  return HEADER_SIZE + count * VECTOR_SIZE_BYTES + count;
}
