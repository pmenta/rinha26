/**
 * @fileoverview Adapter `I16BruteForceVectorIndex` — KNN brute-force sobre
 * vetores quantizados em `i16`. Mesmo `O(N · D)` do baseline f32, mas com
 * **metade da RAM** e **mais cache hits** por vetor (cada cache line de 64
 * bytes carrega 32 valores i16, contra 16 f32).
 *
 * Duas formas de instanciar:
 *
 * - {@link I16BruteForceVectorIndex.fromReferenceVectors} — recebe
 *   `ReferenceVector[]` em float (igual ao baseline). Quantiza no construtor
 *   e **mantém o array original** para responder bit-a-bit nas queries —
 *   compatível com `runVectorIndexContracts({mode: 'exact'})`.
 *
 * - {@link I16BruteForceVectorIndex.fromQuantized} — recebe o payload já em
 *   `Int16Array` + `Uint8Array` (saída do `BinaryDatasetLoader` em runtime
 *   na API). **Não guarda originais**; reconstrói `ReferenceVector` por
 *   dequantização nos top-K (suficiente para `decide()` que só olha `label`).
 */

import {
  FEATURE_VECTOR_LENGTH,
  type FeatureVector,
  type ReferenceLabel,
  type ReferenceVector,
  type VectorIndexError,
  type VectorIndexPort,
  vectorIndexError,
} from '@rinha26/core';
import { type IResult, fail, ok } from 'typescript-monads';

import {
  I16_SCALE,
  floatToI16,
  quantizeFeatureVectorInto,
} from './quantize.js';
import { LABEL_FRAUD } from './binary-format.js';

/** Payload de construção a partir de dados já quantizados. */
export interface QuantizedDataset {
  /** `count * 14` valores i16 contíguos (vetor 0 em [0..14], vetor 1 em [14..28], …). */
  readonly vectors: Int16Array;
  /** `count` bytes — cada um é {@link LABEL_FRAUD} (0x46) ou `LABEL_LEGIT` (0x4C). */
  readonly labels: Uint8Array;
  /** Quantos vetores há no dataset. */
  readonly count: number;
  /** Escala usada na quantização. Default {@link I16_SCALE}. */
  readonly scale?: number;
}

/** Item interno do top-K (sem alocação extra a cada inserção). */
interface ScoredHit {
  distSq: number;
  idx: number;
}

/**
 * Insere `cand` mantendo `top` ordenado por `distSq` crescente, com tamanho
 * ≤ `k`. Mesma estratégia do brute-force baseline (sort após inserção é OK
 * para `k = 5`; para k maior, troca por heap).
 */
function pushTopK(top: ScoredHit[], cand: ScoredHit, k: number): void {
  if (top.length < k) {
    top.push(cand);
    top.sort((a, b) => a.distSq - b.distSq);
    return;
  }
  if (cand.distSq < top[k - 1].distSq) {
    top[k - 1] = cand;
    top.sort((a, b) => a.distSq - b.distSq);
  }
}

export class I16BruteForceVectorIndex implements VectorIndexPort {
  /** Buffer reutilizado para a query quantizada (single-threaded por worker). */
  private readonly queryBuf = new Int16Array(FEATURE_VECTOR_LENGTH);

  private constructor(
    private readonly vectors: Int16Array,
    private readonly labels: Uint8Array,
    private readonly count: number,
    private readonly scale: number,
    /**
     * Array original de `ReferenceVector` quando construído via
     * `fromReferenceVectors`. `null` quando construído via `fromQuantized`
     * (produção). Se presente, queries devolvem o `ReferenceVector` original
     * intocado (bit-a-bit) para passar nos contracts test em `mode: 'exact'`.
     */
    private readonly originals: readonly ReferenceVector[] | null,
  ) {}

  /**
   * Constrói a partir de `ReferenceVector[]` em float. Quantiza tudo em
   * `Int16Array` no construtor e **guarda o array original** para responder
   * com a referência exata nos top-K (compatível com `mode: 'exact'`).
   *
   * **Cuidado com RAM em produção**: este path mantém duas cópias do dataset
   * (originais em float + Int16Array). Use `fromQuantized` em prod.
   */
  static fromReferenceVectors(
    refs: readonly ReferenceVector[],
  ): I16BruteForceVectorIndex {
    const count = refs.length;
    const vectors = new Int16Array(count * FEATURE_VECTOR_LENGTH);
    const labels = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) {
      const ref = refs[i];
      if (ref.vector.length !== FEATURE_VECTOR_LENGTH) {
        throw new Error(
          `[i16-brute-force] reference[${i}].vector.length = ${ref.vector.length}, esperado ${FEATURE_VECTOR_LENGTH}`,
        );
      }
      quantizeFeatureVectorInto(
        ref.vector,
        vectors,
        i * FEATURE_VECTOR_LENGTH,
      );
      labels[i] = ref.label === 'fraud' ? 0x46 : 0x4c;
    }
    return new I16BruteForceVectorIndex(vectors, labels, count, I16_SCALE, refs);
  }

  /**
   * Constrói a partir de dados já quantizados (saída do binary loader em
   * runtime). **Não guarda originais** — reconstrói `ReferenceVector` por
   * dequantização nos top-K.
   */
  static fromQuantized(payload: QuantizedDataset): I16BruteForceVectorIndex {
    const scale = payload.scale ?? I16_SCALE;
    if (payload.vectors.length !== payload.count * FEATURE_VECTOR_LENGTH) {
      throw new Error(
        `[i16-brute-force] vectors.length=${payload.vectors.length} ≠ count*${FEATURE_VECTOR_LENGTH}=${payload.count * FEATURE_VECTOR_LENGTH}`,
      );
    }
    if (payload.labels.length !== payload.count) {
      throw new Error(
        `[i16-brute-force] labels.length=${payload.labels.length} ≠ count=${payload.count}`,
      );
    }
    return new I16BruteForceVectorIndex(
      payload.vectors,
      payload.labels,
      payload.count,
      scale,
      null,
    );
  }

  query(
    q: FeatureVector,
    k: number,
  ): IResult<readonly ReferenceVector[], VectorIndexError> {
    if (k <= 0) {
      return fail<readonly ReferenceVector[], VectorIndexError>(
        vectorIndexError(`k must be > 0, got ${k}`),
      );
    }

    // Quantiza a query no buffer reutilizado — sem alocação por requisição.
    const qb = this.queryBuf;
    for (let i = 0; i < FEATURE_VECTOR_LENGTH; i += 1) {
      qb[i] = floatToI16(q[i]);
    }

    const top: ScoredHit[] = [];
    const vectors = this.vectors;
    const N = this.count;

    for (let n = 0; n < N; n += 1) {
      const base = n * FEATURE_VECTOR_LENGTH;
      let acc = 0;
      // Manualmente desenrolado: D=14 fixo, ajuda o JIT a unroll.
      for (let d = 0; d < FEATURE_VECTOR_LENGTH; d += 1) {
        const diff = qb[d] - vectors[base + d];
        // diff ∈ [-65535, 65535], diff*diff ∈ [0, ~4.3e9] — cabe em float64
        // sem perda. Não usamos Math.imul porque ele faria signed truncation.
        acc += diff * diff;
      }
      pushTopK(top, { distSq: acc, idx: n }, k);
    }

    return ok<readonly ReferenceVector[], VectorIndexError>(
      this.materialize(top),
    );
  }

  /**
   * Converte os top-K (índices internos) em `ReferenceVector[]`. Quando
   * construído via `fromReferenceVectors`, devolve as referências originais
   * (bit-a-bit). Caso contrário, dequantiza para reconstruir o vetor.
   */
  private materialize(top: readonly ScoredHit[]): readonly ReferenceVector[] {
    const out: ReferenceVector[] = new Array(top.length);
    if (this.originals !== null) {
      for (let i = 0; i < top.length; i += 1) {
        out[i] = this.originals[top[i].idx];
      }
      return out;
    }

    const scale = this.scale;
    for (let i = 0; i < top.length; i += 1) {
      const idx = top[i].idx;
      const base = idx * FEATURE_VECTOR_LENGTH;
      const vec = new Array<number>(FEATURE_VECTOR_LENGTH);
      for (let d = 0; d < FEATURE_VECTOR_LENGTH; d += 1) {
        vec[d] = this.vectors[base + d] / scale;
      }
      const label: ReferenceLabel =
        this.labels[idx] === LABEL_FRAUD ? 'fraud' : 'legit';
      out[i] = { vector: vec, label };
    }
    return out;
  }
}
