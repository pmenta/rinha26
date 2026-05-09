/**
 * @fileoverview `runVectorIndexContracts(opts)` — set comum de testes que
 * **toda** implementação de {@link VectorIndexPort} deve passar.
 *
 * Como usar:
 *
 * ```ts
 * // packages/vector-store/src/<kind>/<kind>-vector-index.contract.spec.ts
 * import { runVectorIndexContracts } from '../__contracts__/index.js';
 * import { MyKindIndex } from './my-kind-vector-index.js';
 *
 * runVectorIndexContracts({
 *   name: 'MyKindIndex (exato)',
 *   factory: (refs) => new MyKindIndex(refs),
 *   mode: { kind: 'exact' },  // ou { kind: 'ann', recallMin: 0.95 }
 * });
 * ```
 *
 * Inspira-se em "shared examples" do RSpec — favorece localidade (cada impl
 * tem seu próprio `*.contract.spec.ts` ao lado do código) sem duplicação.
 */

import {
  BruteForceVectorIndex,
  FEATURE_VECTOR_LENGTH,
  type FeatureVector,
  type ReferenceVector,
  type VectorIndexPort,
} from '@rinha26/core';
import { describe, expect, it } from 'vitest';

import {
  buildDeterministicDataset,
  buildDeterministicQuery,
} from './synthetic-dataset.js';

/** Discriminador do "modo" do índice (impl exata vs ANN aproximado). */
export type ContractMode =
  | { readonly kind: 'exact' }
  | {
      readonly kind: 'ann';
      /**
       * Recall mínimo aceito (0..1). `recall = |top-K ∩ oraculo| / K`. ADR-003
       * sugere default `0.95` para impls ANN — ajustar para mais (`0.99+`)
       * se a impl for promovida a default em prod.
       */
      readonly recallMin: number;
    };

/** Opções do contract. */
export interface RunVectorIndexContractsOptions {
  /** Nome legível para o `describe(...)` raiz. */
  readonly name: string;
  /** Fábrica que cria a impl a partir do dataset (chamada uma vez por test). */
  readonly factory: (refs: readonly ReferenceVector[]) => VectorIndexPort;
  /** Modo do índice. Default `{ kind: 'exact' }`. */
  readonly mode?: ContractMode;
  /**
   * Tamanho do dataset usado nos testes de equivalência/recall. Default
   * `1000` — pequeno o bastante para o brute-force ser instantâneo, grande
   * o bastante para detectar bugs de ANN. Pode ser sobrescrito por impls
   * que precisam de dataset maior (ex.: HNSW com `M` alto).
   */
  readonly equivalenceDatasetSize?: number;
}

/**
 * Helper: converte uma referência num "id" estável (string), para uso em
 * `Set` e cálculo de recall/intersection.
 */
function refId(ref: ReferenceVector): string {
  return `${ref.label}|${ref.vector.join(',')}`;
}

/**
 * Conta quantas referências em `actual` aparecem em `expected` (ambos
 * conjuntos de vetores). Usado para `recall` em impls ANN.
 */
function intersectionSize(
  actual: readonly ReferenceVector[],
  expected: readonly ReferenceVector[],
): number {
  const expectedIds = new Set(expected.map(refId));
  let hits = 0;
  for (const a of actual) {
    if (expectedIds.has(refId(a))) hits += 1;
  }
  return hits;
}

/**
 * Registra todos os contracts test para uma impl de {@link VectorIndexPort}.
 * Chame este helper de dentro de um arquivo `*.spec.ts` — ele já cria o
 * `describe(...)` raiz com `opts.name`.
 */
export function runVectorIndexContracts(
  opts: RunVectorIndexContractsOptions,
): void {
  const mode: ContractMode = opts.mode ?? { kind: 'exact' };
  const datasetSize = opts.equivalenceDatasetSize ?? 1_000;

  describe(`VectorIndexPort contract — ${opts.name}`, () => {
    // ----------------------------------------------------------------- //
    // Rejeições                                                         //
    // ----------------------------------------------------------------- //
    describe('rejeições', () => {
      const refs = buildDeterministicDataset({ size: 10, seed: 1 });
      const index = opts.factory(refs);
      const q = buildDeterministicQuery(2) as FeatureVector;

      it('k <= 0 → IResult.fail com VectorIndexError', () => {
        const r = index.query(q, 0);
        expect(r.isFail()).toBe(true);
        expect(r.unwrapFail()._tag).toBe('VectorIndexError');
      });

      it('k negativo → IResult.fail com VectorIndexError', () => {
        const r = index.query(q, -3);
        expect(r.isFail()).toBe(true);
      });
    });

    // ----------------------------------------------------------------- //
    // Vetor inválido no dataset                                         //
    // ----------------------------------------------------------------- //
    it('rejeita ref com vector.length ≠ 14 (ou no build, ou no query)', () => {
      const bad: readonly ReferenceVector[] = [
        { label: 'legit', vector: [0, 0, 0] },
      ];
      const q = buildDeterministicQuery(99) as FeatureVector;

      // Adapters podem detectar no construtor (lazy build) ou no query —
      // qualquer um dos dois é aceitável; o que NÃO pode é silenciosamente
      // produzir resultado inválido.
      let detected = false;
      try {
        const idx = opts.factory(bad);
        const r = idx.query(q, 1);
        if (r.isFail()) detected = true;
      } catch {
        detected = true;
      }
      expect(detected).toBe(true);
    });

    // ----------------------------------------------------------------- //
    // Top-K nominal                                                     //
    // ----------------------------------------------------------------- //
    describe('top-K (k=5) sobre dataset determinístico', () => {
      const refs = buildDeterministicDataset({ size: datasetSize, seed: 42 });
      const oracle = new BruteForceVectorIndex(refs);
      const index = opts.factory(refs);

      // 3 queries diferentes para reduzir flake de ANN.
      const queries: readonly FeatureVector[] = [
        buildDeterministicQuery(101) as FeatureVector,
        buildDeterministicQuery(202) as FeatureVector,
        buildDeterministicQuery(303) as FeatureVector,
      ];

      for (const [i, q] of queries.entries()) {
        if (mode.kind === 'exact') {
          it(`query #${i + 1}: top-K idêntico ao brute-force (busca exata)`, () => {
            const expected = oracle.query(q, 5).unwrap();
            const actual = index.query(q, 5).unwrap();
            // Como brute-force é determinístico em ordem (sort por dist²
            // crescente), comparamos como conjunto E como ordem.
            expect(actual.map(refId)).toEqual(expected.map(refId));
          });
        } else {
          const recallMin = mode.recallMin;
          it(`query #${i + 1}: recall ≥ ${recallMin} vs brute-force (ANN)`, () => {
            const expected = oracle.query(q, 5).unwrap();
            const actual = index.query(q, 5).unwrap();
            const recall = intersectionSize(actual, expected) / 5;
            expect(recall).toBeGreaterThanOrEqual(recallMin);
          });
        }
      }
    });

    // ----------------------------------------------------------------- //
    // k > |dataset|                                                     //
    // ----------------------------------------------------------------- //
    it('k > |dataset| → devolve apenas |dataset| vizinhos (sem duplicar)', () => {
      const refs = buildDeterministicDataset({ size: 7, seed: 5 });
      const idx = opts.factory(refs);
      const q = buildDeterministicQuery(50) as FeatureVector;

      const r = idx.query(q, 100).unwrap();
      expect(r.length).toBe(refs.length);
      // Sem duplicatas.
      expect(new Set(r.map(refId)).size).toBe(refs.length);
    });

    // ----------------------------------------------------------------- //
    // Sentinela -1 (last_transaction:null)                              //
    // ----------------------------------------------------------------- //
    it('aceita sentinela -1 nos índices 5/6 da query e do dataset', () => {
      const baseVec = (): number[] =>
        new Array<number>(FEATURE_VECTOR_LENGTH).fill(0);

      const withNull: number[] = baseVec();
      withNull[5] = -1;
      withNull[6] = -1;

      const noNull: number[] = baseVec();
      noNull[5] = 0;
      noNull[6] = 0;

      const refs: readonly ReferenceVector[] = [
        { label: 'legit', vector: withNull },
        { label: 'fraud', vector: noNull },
      ];

      const idx = opts.factory(refs);
      // `withNull` é `number[]` (mutável) — TS rejeita conversão direta para
      // a tupla `FeatureVector`. Double cast `as unknown as` é o caminho idiomático
      // (número de elementos é garantido por construção, FEATURE_VECTOR_LENGTH=14).
      const r = idx
        .query(withNull as unknown as FeatureVector, 1)
        .unwrap();
      // O top-1 é o `withNull` (distância 0), não o `noNull` (distância
      // hipotética com -1 vs 0 nos eixos 5,6 = √2 ≈ 1.41).
      expect(r[0].label).toBe('legit');
    });
  });
}
