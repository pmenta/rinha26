/**
 * @fileoverview Specs do quantizador i16. Foco em invariantes (clamp,
 * sentinela `-1`, idempotência float→i16→float).
 */

import { describe, expect, it } from 'vitest';

import {
  I16_MAX,
  I16_MIN,
  I16_SCALE,
  floatToI16,
  i16ToFloat,
  quantizeFeatureVector,
  quantizeFeatureVectorInto,
} from './quantize.js';

describe('floatToI16()', () => {
  it('escala 8192 (= 2^13)', () => expect(I16_SCALE).toBe(8192));

  it('0.0 → 0', () => expect(floatToI16(0)).toBe(0));
  it('1.0 → 8192', () => expect(floatToI16(1)).toBe(8192));
  it('-1.0 (sentinela) → -8192 (dentro do range)', () =>
    expect(floatToI16(-1)).toBe(-8192));
  it('0.5 → 4096', () => expect(floatToI16(0.5)).toBe(4096));
  it('0.25 → 2048', () => expect(floatToI16(0.25)).toBe(2048));

  it('arredonda para o inteiro mais próximo', () => {
    // 0.0001 * 8192 = 0.8192 → arredonda para 1
    expect(floatToI16(0.0001)).toBe(1);
    // 0.00005 * 8192 = 0.4096 → arredonda para 0
    expect(floatToI16(0.00005)).toBe(0);
  });

  it('clamp em valores fora do range [I16_MIN/scale, I16_MAX/scale]', () => {
    expect(floatToI16(1000)).toBe(I16_MAX); // 1000 * 8192 estoura
    expect(floatToI16(-1000)).toBe(I16_MIN);
    expect(floatToI16(4)).toBe(I16_MAX); // 4 * 8192 = 32768 (1 acima do max)
  });
});

describe('i16ToFloat()', () => {
  it('roundtrip exato em valores múltiplos de 1/8192', () => {
    expect(i16ToFloat(8192)).toBe(1);
    expect(i16ToFloat(-8192)).toBe(-1);
    expect(i16ToFloat(4096)).toBe(0.5);
    expect(i16ToFloat(0)).toBe(0);
  });

  it('roundtrip aproximado para valores arbitrários (precisão ≈ 1.22e-4)', () => {
    for (const v of [0.123, 0.789, 0.5, 0.001, 0.999, -0.5]) {
      const round = i16ToFloat(floatToI16(v));
      expect(round).toBeCloseTo(v, 3);
    }
  });
});

describe('quantizeFeatureVector / *Into', () => {
  const sampleVec = [
    0.5, 0.25, 0.125, 0.75, 0.333,
    -1, -1, // sentinela
    0.1, 0.9, 1, 0, 0, 0.5, 0.001,
  ] as const;

  it('aloca novo Int16Array de length 14', () => {
    const out = quantizeFeatureVector(sampleVec);
    expect(out).toBeInstanceOf(Int16Array);
    expect(out.length).toBe(14);
    expect(out[0]).toBe(4096); // 0.5 * 8192
    expect(out[5]).toBe(-8192); // sentinela
    expect(out[6]).toBe(-8192);
    expect(out[9]).toBe(8192); // 1.0
  });

  it('quantizeFeatureVectorInto escreve sem alocar e devolve novo offset', () => {
    const buf = new Int16Array(28); // 2 vetores
    const next = quantizeFeatureVectorInto(sampleVec, buf, 0);
    expect(next).toBe(14);
    expect(buf[0]).toBe(4096);
    expect(buf[5]).toBe(-8192);
    // Segundo bloco intacto.
    expect(buf[14]).toBe(0);
    expect(buf[27]).toBe(0);

    // Encadeia: escreve outro vetor a partir do offset retornado.
    const next2 = quantizeFeatureVectorInto(sampleVec, buf, next);
    expect(next2).toBe(28);
    expect(buf[14]).toBe(4096);
  });
});
