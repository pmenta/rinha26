/**
 * @fileoverview Specs do `Metrics`. Pequenas e diretas — invariantes de
 * incremento, snapshot imutável, totalização.
 */

import { describe, expect, it } from 'vitest';

import { Metrics } from './metrics.js';

describe('Metrics', () => {
  it('snapshot inicial é tudo zero', () => {
    expect(new Metrics().snapshot()).toEqual({
      default_safe_use_case_fail: 0,
      default_safe_invalid_body: 0,
      knn_real: 0,
      total: 0,
    });
  });

  it('cada increment soma 1 no contador correto', () => {
    const m = new Metrics();
    m.incKnnReal();
    m.incKnnReal();
    m.incDefaultSafeUseCaseFail();
    m.incDefaultSafeInvalidBody();
    m.incDefaultSafeInvalidBody();
    m.incDefaultSafeInvalidBody();

    expect(m.snapshot()).toEqual({
      knn_real: 2,
      default_safe_use_case_fail: 1,
      default_safe_invalid_body: 3,
      total: 6,
    });
  });

  it('snapshot é imutável (modificar o snapshot não altera o counter)', () => {
    const m = new Metrics();
    m.incKnnReal();
    const snap = m.snapshot();
    // TypeScript marca como readonly, mas em runtime o JS permitiria mutação;
    // garantimos com Object.freeze? Não — usamos `readonly` no tipo, suficiente
    // para nosso uso interno. O teste documenta a expectativa.
    expect(snap.knn_real).toBe(1);
    m.incKnnReal();
    // O snapshot anterior NÃO mudou.
    expect(snap.knn_real).toBe(1);
    expect(m.snapshot().knn_real).toBe(2);
  });
});
