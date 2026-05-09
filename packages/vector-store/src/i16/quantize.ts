/**
 * @fileoverview Quantização float ↔ int16 com escala fixa.
 *
 * **Objetivo:** trocar os 4 bytes/dimensão do `f32` por 2 bytes/dimensão do
 * `i16`. Para 3M vetores × 14 dimensões: **168 MB → 84 MB** (50% RAM e
 * 50% mais cache hits). A perda de precisão é controlada pela escala.
 *
 * **Escala 8192** (= 2¹³): precisão fracional ≈ 1.22 × 10⁻⁴, range
 * representável `[-4.000, +3.999]`. Suficiente para vetores de
 * `docs/REGRAS_DE_DETECCAO.md` (todos em `[0, 1]` exceto sentinela `-1`).
 *
 * **Sentinela `-1`** (last_transaction:null) vira **`-8192`** em i16 —
 * dentro do range, mantém comportamento de "longe de tudo no espaço".
 *
 * Notas de SIMD (futuro): manter escala potência de 2 facilita futuras
 * impls com shifts (>>13) em vez de divisão.
 */

import {
  FEATURE_VECTOR_LENGTH,
  type FeatureVector,
} from '@rinha26/core';

/** Escala oficial deste pacote (2¹³). Não trocar sem ADR. */
export const I16_SCALE = 8192 as const;

/** Inteiro i16 mais negativo (`-2^15`). */
export const I16_MIN = -32768 as const;
/** Inteiro i16 mais positivo (`+2^15 - 1`). */
export const I16_MAX = 32767 as const;

/**
 * Quantiza um único float para i16 com a escala oficial. Faz clamp do
 * resultado em `[I16_MIN, I16_MAX]` para evitar overflow silencioso.
 */
export function floatToI16(value: number): number {
  const scaled = Math.round(value * I16_SCALE);
  if (scaled < I16_MIN) return I16_MIN;
  if (scaled > I16_MAX) return I16_MAX;
  return scaled;
}

/** Inverso de {@link floatToI16}. */
export function i16ToFloat(value: number): number {
  return value / I16_SCALE;
}

/**
 * Quantiza um {@link FeatureVector} (14 dimensões) escrevendo no
 * `Int16Array` destino a partir de `offset`. **Não aloca**.
 *
 * Usado pela query da API (vetor da requisição vira i16 antes do brute-force)
 * e pelo preprocessor (cada vetor do dataset → bloco de 28 bytes).
 *
 * @returns o offset depois do bloco escrito (caller pode encadear).
 */
export function quantizeFeatureVectorInto(
  source: FeatureVector | readonly number[],
  destination: Int16Array,
  offset: number,
): number {
  for (let i = 0; i < FEATURE_VECTOR_LENGTH; i += 1) {
    destination[offset + i] = floatToI16(source[i]);
  }
  return offset + FEATURE_VECTOR_LENGTH;
}

/** Atalho que aloca um `Int16Array` novo de 14 elementos. */
export function quantizeFeatureVector(
  source: FeatureVector | readonly number[],
): Int16Array {
  const out = new Int16Array(FEATURE_VECTOR_LENGTH);
  quantizeFeatureVectorInto(source, out, 0);
  return out;
}
