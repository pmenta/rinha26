/**
 * @fileoverview Gerador de datasets determinísticos para os contracts test.
 *
 * **Por que não `Math.random()`?** Tests determinísticos exigem mesma sequência
 * a cada run (CI/local/qualquer máquina). Usamos um LCG (Linear Congruential
 * Generator) simples — sem dep externa, suficiente para o que precisamos
 * (não é usado em criptografia nem na detecção real, só para estress de impls).
 *
 * Os parâmetros do LCG vêm de Numerical Recipes (Park-Miller minimal standard).
 */

import {
  FEATURE_VECTOR_LENGTH,
  type ReferenceVector,
} from '@rinha26/core';

/** Cria um RNG determinístico seed-able. Devolve um closure `rng()` em [0,1). */
export function makeRng(seed: number): () => number {
  // Park-Miller minimal standard. Aceita seed inicial > 0.
  let state = seed > 0 ? seed % 2147483647 : 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** Opções da geração do dataset. */
export interface SyntheticDatasetOptions {
  /** Quantos vetores gerar. */
  readonly size: number;
  /** Seed do RNG (default 42). */
  readonly seed?: number;
  /**
   * Probabilidade de um vetor receber o sentinela `-1` nos índices 5/6
   * (`last_transaction:null`). Default `0.3` — mistura realista.
   */
  readonly nullLastTxProbability?: number;
  /**
   * Probabilidade de um vetor ser rotulado `fraud`. Default `0.3` —
   * coerente com a `fraud_rate` típica do `test-data.json`.
   */
  readonly fraudProbability?: number;
}

/**
 * Cria `size` vetores de 14 dimensões reproducíveis. Usado para validar
 * impls de `VectorIndexPort` sem depender do dataset oficial (que tem 3M
 * vetores e seria caro carregar no CI a cada spec).
 */
export function buildDeterministicDataset(
  opts: SyntheticDatasetOptions,
): readonly ReferenceVector[] {
  const seed = opts.seed ?? 42;
  const nullProb = opts.nullLastTxProbability ?? 0.3;
  const fraudProb = opts.fraudProbability ?? 0.3;
  const rng = makeRng(seed);

  const out: ReferenceVector[] = new Array(opts.size);
  for (let i = 0; i < opts.size; i += 1) {
    const useSentinel = rng() < nullProb;
    const vector = new Array<number>(FEATURE_VECTOR_LENGTH);
    for (let d = 0; d < FEATURE_VECTOR_LENGTH; d += 1) {
      if ((d === 5 || d === 6) && useSentinel) {
        vector[d] = -1;
      } else if (d === 9 || d === 10 || d === 11) {
        // is_online / card_present / unknown_merchant — binários.
        vector[d] = rng() < 0.5 ? 0 : 1;
      } else {
        vector[d] = rng();
      }
    }
    out[i] = {
      vector,
      label: rng() < fraudProb ? 'fraud' : 'legit',
    };
  }
  return out;
}

/**
 * Atalho: gera uma **query** (mesmo formato dos vetores do dataset) com seed
 * separado, para evitar overlap exato com o conjunto.
 */
export function buildDeterministicQuery(seed: number): readonly number[] {
  const rng = makeRng(seed);
  const v = new Array<number>(FEATURE_VECTOR_LENGTH);
  for (let d = 0; d < FEATURE_VECTOR_LENGTH; d += 1) {
    if (d === 9 || d === 10 || d === 11) {
      v[d] = rng() < 0.5 ? 0 : 1;
    } else {
      v[d] = rng();
    }
  }
  return v;
}
